
/**
 * TSDB remote client VERSION_TAG 
 */

import {Spi,Api} from 'jsdb';

type BroadcastCb = (sub :Subscription, acpath :string, acval:any)=>void;
export type SortFunction = (a: any, b: any) => number;

export class EventsBatch {
    constructor (public subscription :Subscription) {}

    events = {
        child_added :<any[][]>[],
        child_removed :<any[][]>[],
        child_changed :<any[][]>[],
        child_moved :<any[][]>[],
        value :<any[][]>[]
    }

    merge(other :EventsBatch) {
        for (var k in other.events) {
            var events :any[][] = (<any>other.events)[k];
            if (!events) continue;
            for (var i = 0; i < events.length; i++) {
                (<any[][]>(<any>this.events)[k]).push(events[i]);
            }
        }
    }

    send(toValue = false) {
        var cbs = this.subscription.cbs;
        // Dispatch the events to the handlers
        for (var i = 0; i < cbs.length; i++) {
            var cb = cbs[i];

            if (!toValue && cb.eventType == 'value') continue;
            if (toValue && cb.eventType != 'value') continue;

            var events = <any[][]>(<any>this.events)[cb.eventType];
            if (events) {
                // Sort events
                events.sort((eva:any,evb:any)=>{
                    return eva[2] < evb[2] ? -1 : eva[2] == evb[2] ? 0 : 1;
                });
                for (var j = 0; j < events.length; j++) {
                    events[j].splice(2,1);
                    dbgEvt("Dispatching event %s:%s to %s", this.subscription.path, cb.eventType, cb._intid);
                    cb.callback.apply(this.subscription.root, events[j]);
                }
            }
        }
        if (!toValue) this.send(true);
    }

}

export class MergeState {
    writeVersion = 0;
    deepInspect = false;
    insideComplete = false;
    highest = 0;

    batches :EventsBatch[] = [];

    derive() {
        var ret = new MergeState();
        ret.writeVersion = this.writeVersion;
        ret.deepInspect = this.deepInspect;
        ret.insideComplete = this.insideComplete;
        ret.highest = this.highest;
        ret.batches = this.batches;
        return ret;
    }

    sendEvents() {
        for (var i = 0; i < this.batches.length; i++) {
            this.batches[i].send();
        }
    }

}

export interface SortResult {
    prev? :string;
    actual? :string;
    index? :number;
}

export class Metadata {
    versions :{[index:string]:number} = {};
    sorted :string[] = [];
    highest = 0;
    incomplete :boolean = null;

    binaryIndexOf(key :string, compare? :SortFunction, arr = this.sorted) :[boolean,number] {
        if (!compare) compare = (a,b) => {
            return (a<b) ? -1 : (a==b) ? 0 : 1;
        }
        var min = 0;
        var max = arr.length - 1;
        var guess :number;
    
        var c = 0; 
        while (min <= max) {
            guess = Math.floor((min + max) / 2);
    
            c = compare(arr[guess],key);
            if (c === 0) {
                return [true, guess];
            } else {
                if (c < 0) {
                    min = guess + 1;
                } else {
                    max = guess - 1;
                }
            }
        }
        return [false, c<0 ? guess+1 : guess];
    }

    modifySorted(modifieds :string[], added :boolean[], compare? :SortFunction) :SortResult[] {
        var ret :SortResult[] = [];

        // Find old positions for all non removed elements
        for (var i = 0; i < modifieds.length; i++) {
            if (added[i] === false) {
                ret[i] = {};
                continue;
            }
            var io = this.sorted.indexOf(modifieds[i]);
            if (io == -1) {
                ret[i] = {prev: null};
            } else {
                ret[i] = {prev: this.sorted[io-1]};
            }
        }

        // Remove all elements
        for (var i = 0; i < modifieds.length; i++) {
            var io = this.sorted.indexOf(modifieds[i]);
            if (io == -1) continue;
            this.sorted.splice(io, 1);
            // TODO eventually add to ret what needed for a child_moved
        }

        // Add new (or modified) elements
        for (var i = 0; i < modifieds.length; i++) {
            if (added[i] === false) continue;
            var fnd = this.binaryIndexOf(modifieds[i], compare)
            if (fnd[0]) continue;
            this.sorted.splice(fnd[1],0,modifieds[i]);
            // TODO we already know the position here, but it could change because of other adds
        }

        // Now compute new positions
        for (var i = 0; i < modifieds.length; i++) {
            if (added[i] === false) continue;
            var fnd = this.binaryIndexOf(modifieds[i], compare)
            if (!fnd[0]) continue;
            ret[i].actual = this.sorted[fnd[1]-1] || null;
            ret[i].index = fnd[1];
        }

        return ret;
    }
}


export interface Socket {
    id :string;
    on(event :string, cb :(...args :any[])=>any) :any;
    emit(event :string, ...args :any[]) :any;
}

export var VERSION = 'VERSION_TAG';

var noOpDbg = (...any :any[])=>{}; 
var dbgRoot = noOpDbg, dbgIo = noOpDbg, dbgTree = noOpDbg, dbgEvt = noOpDbg;
var Debug :any = null;
if (typeof(window) != 'undefined' && typeof((<any>window)['debug']) == 'function') {
    Debug = (<any>window)['debug'];
} else if (typeof(require) !== 'undefined') {
    try {
        var Debug = require('debug');
    } catch (e) {
    }
}
if (Debug) {
    dbgRoot = Debug('tsdb:rclient:root');
    dbgIo = Debug('tsdb:rclient:io');
    dbgTree = Debug('tsdb:rclient:tree');
    dbgEvt = Debug('tsdb:rclient:events');
}

export interface RDb3Conf extends Api.DatabaseConf {
    baseUrl? :string,
    socket? :Socket 
}

var prog = 0;

export class RDb3Root implements Spi.DbTreeRoot {

    constructor(private sock :Socket, private baseUrl :string) {
        dbgRoot('Building root %s for socket %s', baseUrl, sock?sock.id:'NONE');
        this.data = {};
        this.getOrCreateMetadata('').incomplete = true;
        if (sock) {
            sock.on('v', (msg:any)=>this.receivedValue(msg));
            sock.on('qd', (msg:any)=>this.receivedQueryDone(msg));
            sock.on('qx', (msg:any)=>this.receivedQueryExit(msg));
            sock.on('connect', ()=>{
                for (var k in this.subscriptions) {
                    // Filter query subscriptions
                    if (k.indexOf('/qry__') == 0) continue;
                    this.sendSubscribe(k);
                }
                for (var k in this.queries) {
                    var qs = this.queries[k];
                    this.sendSubscribeQuery(qs);
                }
            });
        }
    }

    private subscriptions :{[index:string]:Subscription} = {};
    private queries :{[index:string]:QuerySubscription} = {};
    private ongoingWrite :{[index:string]:number} = {};

    private metadata :{[index:string]:Metadata} = {};
    private data :any;

    private doneProm :Promise<any> = null;

    private writeProg = 1;

    nextProg() :number {
        this.writeProg++;
        return this.writeProg;
    }

    actualProg() :number {
        return this.writeProg;
    }

    getUrl(url: string): RDb3Tree {
        return new RDb3Tree(this, Utils.normalizePath(this.makeRelative(url)));
    }
    makeRelative(url: string): string {
        if (url.indexOf(this.baseUrl) != 0) return url;
        return "/" + url.substr(this.baseUrl.length);
    }
    makeAbsolute(url: string): string {
        return (this.baseUrl || '') + this.makeRelative(url);
    }

    isReady(): boolean {
        return true;
    }

    whenReady(): Promise<any> {
        if (this.doneProm) return this.doneProm;
        if (this.sock) {
            dbgRoot('Asked when ready, creating promise');
            this.doneProm = new Promise((res,err)=>{
                var to = setTimeout(()=>{
                    dbgRoot('Message "aa" on the socket timedout after 30s');
                    err(new Error('Timeout'));
                }, 30000);
                this.sock.on('aa', ()=>{
                    clearTimeout(to);
                    dbgRoot('Got "aa" message, root is now ready');
                    res();
                });
            });
            return this.doneProm;
        } else {
            return Promise.resolve();
        }
    }


    receivedValue(msg :any) {
        dbgIo('Received Value v %s for "%s" : %o', msg.n, msg.p, msg);
        this.handleChange(msg.p, msg.v, msg.n, msg.q);
    }

    receivedQueryDone(msg :any) {
        dbgIo('Received QueryDone for %s : %o', msg.q, msg);
        var qdef = this.queries[msg.q];
        if (!qdef) return;
        qdef.markDone();
    }

    receivedQueryExit(msg :any) {
        dbgIo('Received QueryExit v %s for "%s" : %o', msg.n, msg.q, msg);
        var qdef = this.queries[msg.q];
        if (!qdef) return;
        qdef.queryExit(msg.p);
    }

    send(...args :any[]) {
        if (this.sock) {
            dbgIo('Sending %o', args);
            this.sock.emit.apply(this.sock, args);
        } else {
            dbgIo('NOT SENDING %o', args);
        }
    }

    sendSubscribe(path :string) {
        this.send('sp', path);
    }

    sendUnsubscribe(path :string) {
        this.send('up', path);
    }

    sendSubscribeQuery(def :QuerySubscription) {
        var sdef :any = {
            id: def.id,
            path: def.path
        }
        if (def.compareField) {
            sdef.compareField = def.compareField;
        }
        if (typeof(def.equals) !== 'undefined') {
            sdef.equals = def.equals;
        }
        if (def.valuein) {
            sdef.valuein = def.valuein;
        }
        if (typeof(def.from) !== 'undefined') {
            sdef.from = def.from;
        }
        if (typeof(def.to) !== 'undefined') {
            sdef.to = def.to;
        }
        if (def.limit) {
            sdef.limit = def.limit;
            sdef.limitLast = def.limitLast;
        }
        if (def.sortField) {
            sdef.sortField = def.sortField;
        }
        this.send('sq', sdef);
    }

    sendUnsubscribeQuery(id :string) {
        this.send('uq', id);
    }
    

    subscribe(path :string) :Subscription {
        path = Utils.normalizePath(path);
        var sub = this.subscriptions[path];
        if (!sub) {
            this.subscriptions[path] = sub = new Subscription(this, path);
        }
        return sub;
    }

    unsubscribe(path :string) {
        delete this.subscriptions[path];
        this.checkUncovered(path);
    }

    doneWrite(url :string) {
        this.ongoingWrite[url] = (this.ongoingWrite[url] || 0) - 1;
        if (this.ongoingWrite[url] <= 0) delete this.ongoingWrite[url];
        // If the write is finished and there is no subscription, we can delete it 
        this.checkUncovered(url);
    }
    
    startingWrite(url :string) {
        this.ongoingWrite[url] = (this.ongoingWrite[url] || 0) + 1;
    }

    checkUncovered(path :string) {
        /*
        Principile is :
        - If resource is covered by other subscription, skip
        - If resource is protected by ongoing write, skip
        - Otherwise delete the resource
        - When a write has just been done 
        ... ongoing-write protect the resource
        ... Wait for write completion (ack from server) then :
        ...... remove ongoing write protection
        ...... is no subscription, run the removal from first step
        */

        // Make a list of paths to sub-subscriptions and sub-ongoing-write
        var subCovereds :string[] = [];

        // Search anchestors for active sub, in that case exit
        for (var k in this.subscriptions) {
            if (path.indexOf(k) == 0) return;
            if (k.indexOf(path) == 0) subCovereds.push(k);
        }
        // Search anchestors for ongoing write protection, in case exit
        for (var k in this.ongoingWrite) {
            if (path.indexOf(k) == 0) return;
            if (k.indexOf(path) == 0) subCovereds.push(k);
        }

        // Create the new data, extending the previous one, having undefined in the removed path
        var ndata :any = {};

        var parts = path.split('/').slice(1);
        var ac = this.data;
        var nv :any = ndata;
        setPrototypeOf(nv, ac);
        
        for (var i = 0; i < parts.length - 1; i++) {
            ac = ac[parts[i]];
            if (typeof(ac) !== 'object') break;
            if (ac == null) break;
            var no = {};
            nv[parts[i]] = no;
            nv = no;
            setPrototypeOf(nv, ac);
        }
        if (ac != null && typeof(ac) === 'object') {
            if (subCovereds.length == 0) {
                // If no sub elementes, we can set it to undefined
                nv[parts[parts.length-1]] = undefined;
            } else {
                // Create the new data object, copying the subcovereds in the right position
                // focus on the current object 
                ac = ac[parts[parts.length-1]];
                // create a new version, will contain only subs
                var no = {};
                for (var i = 0; i < subCovereds.length; i++) {
                    // using parts.length taks only the substring from the current path and over
                    var sp = subCovereds[i].split('/').slice(parts.length + 1);
                    // find the old value
                    var olc = findChain(sp, ac, true, false);
                    var olv = olc.pop();
                    if (olv === undefined) continue;

                    // create the new container
                    var noc = findChain(sp, no, false, true);
                    var nev :any = noc.pop();
                    // set the value
                    nev[sp.pop()] = olv;
                }
                nv[parts[parts.length-1]] = no;
            }

            this.data = ndata;
        }

        // Delete all metadatas equal or sub of the path
        for (var k in this.metadata) {
            if (k.indexOf(path) == 0) {
                delete this.metadata[k];
            }
        }

    }

    /*
    private recursiveClean(path :string, val :any) {
        if (typeof(val) !== 'object') return;
        if (val === KNOWN_NULL) return;
        dbgRoot("Recursing down, invalidating %s", path);
        markIncomplete(val);
        for (var k in val) {
            var subp = path + '/' + k;
            if (this.subscriptions[subp]) {
                continue;
            }
            this.recursiveClean(subp, val[k]);
        }
    }
    */

    subscribeQuery(query :QuerySubscription) {
        this.queries[query.id] = query;
        this.subscriptions['/qry__' + query.id] = query; 
    }

    unsubscribeQuery(id :string) {
        this.sendUnsubscribeQuery(id);
        delete this.queries[id];
        delete this.subscriptions['/qry__' + id];
        //delete this.data['q' + id];
    }

    getValue(url: string | string[]) :any {
        var ret = findChain(url, this.data, true, false);
        return ret.pop();
    }

    getOrCreateMetadata(path :string, initing = true) :Metadata {
        var ret = this.metadata[path];
        if (!ret) {
            ret = new Metadata();
            if (initing) {
                var parent = this.getNearestMetadata(path);
                if (parent) {
                    ret.incomplete = parent.incomplete;
                    ret.highest = parent.highest;
                }
            }
            this.metadata[path] = ret;
            dbgRoot("Created new metadata for %s", path);
        }
        return ret;
    }

    getMetadata(path :string) :Metadata {
        return this.metadata[path];
    }

    getNearestMetadata(path :string) :Metadata {
        var ret :Metadata = this.metadata[path];
        if (ret) {
            dbgRoot("Nearest metadata to %s is itself : %o", path, ret);
            return ret;
        }
        var fndpath :string = null;
        var acl :number = -1;
        for (var k in this.metadata) {
            if (path.indexOf(k) == 0) {
                if (k.length > acl) {
                    acl = k.length;
                    fndpath = k;
                    ret = this.metadata[k];
                }
            }
        }
        dbgRoot("Nearest metadata to %s is %s : %o", path, fndpath, ret);
        return ret;
    }

    handleChange(path :string, val :any, prog :number, queryId? :string) {
        dbgRoot("Handling change on %s for prog %s (query %s)", path, prog, queryId);
        var querySub :QuerySubscription = null;
        if (queryId) {
            querySub = this.queries[queryId];
            if (!querySub) {
                // Stale query TODO send unsub again?
            }
        }

        // Normalize the path to "/" by wrapping the val
        var nv :any = val;
        var sp = splitUrl(path);
        sp.splice(0,1);
        while (sp.length) {
            var nnv :any = {};
            nnv[sp.pop()] = nv;
            nnv.$i = true;
            nv = nnv;
        }

        var state = new MergeState();
        state.writeVersion = prog;
        this.merge('', nv, this.data, state, querySub);

        this.data = nv;

        state.sendEvents();

        // Special case for root
        if (val == null && path == '') {
            this.data = {};
            this.metadata = {};
            this.getOrCreateMetadata('').incomplete = false;
        }
    }

    merge(path :string, newval :any, oldval :any, state :MergeState, querySub? :QuerySubscription) {
        var sub = this.subscriptions[path];
        var atQuery = querySub && (path == querySub.path);
        if (newval !== null && typeof(newval) === 'object') {
            // We are handling a modification object
            var meta = this.getOrCreateMetadata(path, false);

            // Find versions, stored on the parent to accomodate leaf native values

            // Check/update the highest version
            var preHighest = meta.highest;
            if (state.writeVersion > preHighest) {
                meta.highest = state.writeVersion;
            }
            preHighest = preHighest || state.highest;

            var wasIncomplete = meta.incomplete;
            if (meta.incomplete || meta.incomplete === null) {
                if (state.insideComplete) {
                    meta.incomplete = false;
                } else {
                    meta.incomplete = !!newval.$i;
                }
            }
 
            // Check if we can shortcut
            if (!state.deepInspect && !sub && !atQuery && !newval.$i && preHighest <= state.writeVersion) {
                // Look for subscriptions in children and below
                var hasGrandSubs = false;
                for (var k in this.subscriptions) {
                    if (k.indexOf(path) == 0) {
                        if (path == k) continue;
                        hasGrandSubs = true;
                        break;
                    }
                }
                if (!hasGrandSubs) {
                    // We satisfied the conditions for a shortcut, that is 
                    // 1) We are not looking (or not looking anymore) for a child_changed, so don't need to inspect deeply
                    // 2) There is no subscriptions to notify in this branch of the tree
                    // 3) The value we are setting is complete, so it replace all this branch of the tree
                    // 4) The current writing version is higher or equal to the highest version seen in this branch of the tree
                    // So, nothing to do here, the new value replaces the old one in the prorotype chain and that's it

                    // Delete children metas, cause they're stale now
                    for (var k in this.metadata) {
                        if (k.indexOf(path) == 0) {
                            if (path == k) continue;
                            delete this.metadata[k];
                        }
                    }

                    return true;
                }
            }

            // If we have a child_changed or child_moved, we need so set the deepInspect
            var substate = state.derive();
            substate.deepInspect = substate.deepInspect || sub && !!(sub.types['child_changed'] || sub.types['child_moved']);
            substate.deepInspect = substate.deepInspect || (atQuery && !!(querySub.types['child_changed'] || querySub.types['child_moved']));

            substate.insideComplete = meta.incomplete === false;
            substate.highest = preHighest;

            // Check what we have to clean and what to update based on versions, then send it recursively
            var modifieds :string[] = [];
            for (var k in newval) {
                if (k.charAt(0) == '$') continue;
                if (meta.versions[k] > state.writeVersion) {
                    // Current version is newer than the write version, delete the write
                    delete newval[k];
                } else {
                    // If the child is complete, we can update its version
                    if (newval[k] && !newval[k].$i) {
                        meta.versions[k] = state.writeVersion;
                    }
                    if (this.merge(path + '/' + k, newval[k], oldval ? oldval[k] : null, substate, querySub)) {
                        modifieds.push(k);
                        if (newval[k] === null) {
                            //meta.knownNull = true;
                            newval[k] = undefined;
                            // TODO KNOWN_NULL is nother thing to clean up from snapshot.val, try to find another way
                            //newval[k] = KNOWN_NULL;
                        }
                    }
                }
            }

            // If the new object is complete, nullify previously existing keys that are not found now
            if (!newval.$i) {
                for (var k in oldval) {
                    if (k.charAt(0) == '$') continue;
                    var prever = meta.versions[k];
                    if (prever && prever > state.writeVersion) {
                        // Version conflict, update new data with old data :)
                        delete newval[k];
                        continue;
                    }
                    if (oldval[k] && !(k in newval)) {
                        newval[k] = undefined;
                        modifieds.push(k);
                    }
                }
            }
            
            delete newval.$i;

            if (oldval) {
                setPrototypeOf(newval, oldval);
            }

            // TODO if this passed from incomplete to complete, then it is CHANGED and should trigger events
            var forceModified = meta.incomplete === false && wasIncomplete !== false; 

            if (sub) {
                state.batches.push(sub.checkHandlers(meta, newval, oldval, modifieds, forceModified));
            }
            if (atQuery) {
                state.batches.push(querySub.checkHandlers(meta, newval, oldval, modifieds, forceModified));
            }

            return !!modifieds.length;
        } else {
            // We are handling a leaf value
            if (sub) state.batches.push(sub.checkHandlers(null, newval, oldval, null, false));
            // TODO this should never happen, value of a query with a single leaf primitive value??
            if (atQuery) state.batches.push(querySub.checkHandlers(null, newval, oldval, null, false));
            return newval != oldval;
        }
    }

    static create(conf :RDb3Conf) {
        if (!conf.socket) {
            if (!conf.baseUrl) throw Error("Configure RClient with either 'socket' or 'baseUrl'");
            if (typeof(io) === 'function') {
                conf.socket = io(conf.baseUrl); 
            } else {
                throw new Error("Cannot find Socket.IO to start a connection to " + conf.baseUrl);
            }
        }
        var ret = (<any>conf.socket).Db3Root || new RDb3Root(conf.socket, conf.baseUrl);
        (<any>conf.socket).Db3Root = ret;
        return ret;
    }

}

var glb :any = typeof window !== 'undefined' ? window : global; 
if (glb || typeof(require) !== 'undefined') {
    try {
        var TsdbImpl = glb['Tsdb'] || require('jsdb');
        TsdbImpl.Spi.registry['rclient'] = RDb3Root.create;
    } catch (e) {
        console.log(e);
    }
}




export class Subscription {

    constructor(public root :RDb3Root, public path :string) {

    }

    types :{[index:string]:number} = {};

    cbs: Handler[] = [];

    private sentSubscribe = false;
    private needSubscribe = false;

    add(cb: Handler) {
        dbgEvt("Adding handler %s %s to %s", cb._intid, cb.eventType, this.path);
        this.cbs.push(cb);
        this.types[cb.eventType] = (this.types[cb.eventType] || 0) + 1; 
        if (this.cbs.length == 1) this.subscribe();
    }

    remove(cb: Handler) {
        this.cbs = this.cbs.filter((ocb) => ocb !== cb);
        dbgEvt("Removed handler %s %s from %s", cb._intid, cb.eventType, this.path);
        this.types[cb.eventType] = (this.types[cb.eventType] || 1) - 1; 
        if (this.cbs.length == 0) this.unsubscribe();
    }

    subscribe() {
        dbgEvt("Subscribing to %s", this.path);
        this.needSubscribe = true;
        nextTick(()=>{
            if (this.sentSubscribe) return;
            if (this.needSubscribe) {
                dbgEvt("Subscribe to %s not cancelled", this.path);
                this.root.sendSubscribe(this.path);
                this.sentSubscribe = true;
            }
        });
    }

    unsubscribe() {
        dbgEvt("Unsubscribing to %s", this.path);
        var prog = this.root.actualProg();
        this.needSubscribe = false;
        nextTick(()=>{
            if (this.needSubscribe) return;
            this.root.unsubscribe(this.path);
            if (this.sentSubscribe) {
                this.root.sendUnsubscribe(this.path);
                this.sentSubscribe = false;
            }
        });
    }

    checkHandlers(meta :Metadata, newval :any, oldval :any, modified :string[], force :boolean) :EventsBatch {
        var batch = new EventsBatch(this);

        if (meta) {
            // Update the metadata with current keys
            var added :boolean[] = [];
            for (var i = 0; i < modified.length; i++) {
                var k = modified[i];
                if (oldval && typeof(oldval[k]) !== 'undefined') {
                    if (!newval || typeof(newval[k]) === 'undefined') {
                        added[i] = false;
                    }
                } else if (newval && typeof(newval[k]) !== 'undefined') {
                    added[i] = true;
                }
            }

            var sortchange = meta.modifySorted(modified, added, this.makeSorter());

            // Build proper events for each event type
            // TODO we could do this only if there is someone listening and save few cpu ticks
            for (var i = 0; i < modified.length; i++) {
                var k = modified[i];
                if (added[i] === true) {
                    batch.events.child_added.push([new RDb3Snap(newval[k], this.root, this.path + '/' + k), sortchange[i].actual, sortchange[i].index]);
                } else if (added[i] === false) {
                    batch.events.child_removed.push([new RDb3Snap(oldval[k], this.root, this.path + '/' + k),null,0]);
                } else {
                    batch.events.child_changed.push([new RDb3Snap(newval[k], this.root, this.path + '/' + k), sortchange[i].actual, sortchange[i].index]);
                    if (sortchange[i].prev != sortchange[i].actual) {
                        batch.events.child_moved.push([new RDb3Snap(newval[k], this.root, this.path + '/' + k), sortchange[i].actual, sortchange[i].index]);
                    }
                }
            }
        }

        // Send value last
        var valueHandlers = this.findByType('value');
        if (valueHandlers.length) {
            if (!force) {
                if (newval && typeof(newval) === 'object') {
                    if ((!modified || modified.length == 0) || meta.incomplete) {
                        dbgEvt("Not notifying %s:value because modified %s or incomplete %s", this.path, modified && modified.length, meta.incomplete);
                        return batch;
                    }
                } else {
                    if (newval === null) {
                        if (oldval === null) {
                            dbgEvt("Not notifying %s:value both are nulls", this.path);
                            return batch;
                        }
                    } else if (newval === undefined) {
                        // Always broadcast an explicit undefined
                    } else {
                        if (newval == oldval) {
                            dbgEvt("Not notifying %s:value both are same", this.path);
                            return batch;
                        }
                    }
                }
            }
            var event = [new RDb3Snap(newval, this.root, this.path), null, 0];
            batch.events.value.push(event);
        }
        return batch;
    }

    findByType(evtype :string) :Handler[] {
        return this.cbs.filter((ocb)=>ocb.eventType==evtype);
    }

    getCurrentValue() {
        return this.root.getValue(this.path);
    }

    getCurrentMeta() {
        return this.root.getOrCreateMetadata(this.path);
    }

    makeSorter() :SortFunction {
        return null;
    }

}



var progQId = 1;

export class QuerySubscription extends Subscription {
    id: string = (progQId++)+'a';

    compareField: string = null;
    from: string | number;
    to: string | number;
    equals: string | number;
    valuein: string[] | number[];
    limit: number = null;
    limitLast = false;

    sortField :string;

    //done = false;

    myData :any = {};
    myMeta :Metadata = new Metadata();

    constructor(oth: Subscription | QuerySubscription) {
        super(oth.root, oth.path);
        this.myMeta.incomplete = true;
        if (oth instanceof QuerySubscription) {
            this.compareField = oth.compareField;
            this.from = oth.from;
            this.to = oth.to;
            this.equals = oth.equals;
            this.valuein = oth.valuein;
            this.limit = oth.limit;
            this.limitLast = oth.limitLast;
            this.sortField = oth.sortField;
        }
    }

    add(cb: Handler) {
        super.add(cb);
    }

    remove(cb: Handler) {
        super.remove(cb);
    }

    subscribe() {
        this.root.subscribeQuery(this);
        this.root.sendSubscribeQuery(this);
    }

    unsubscribe() {
        this.root.unsubscribeQuery(this.id);
    }

    getCurrentValue() {
        return this.myData;
    }

    getCurrentMeta() {
        return this.myMeta;
    }

    // Trick into thinking there is no value handler if query is not finished yet
    findByType(evtype :string) :Handler[] {
        if (evtype == 'value' && this.myMeta.incomplete) return [];
        return super.findByType(evtype);
    }


    // We handle this a bit differently for queries
    checkHandlers(meta :Metadata, newval :any, oldval :any, modified :string[], force :boolean) :EventsBatch {
        // Copy from new val to my new val, only own values
        var mynewval :any = {};
        // TODO maybe use modified?
        var nks = Object.getOwnPropertyNames(newval);
        var mymodifieds :string[] = [];
        for (var i = 0; i < nks.length; i++) {
            var k = nks[i];
            mynewval[k] = newval[k];
            mymodifieds.push(k);
        }

        // Make my new val extend my old val
        var myoldval = this.myData;
        setPrototypeOf(mynewval, myoldval);
        this.myData = mynewval;

        // Forward to super.checkHandlers using my meta and my values
        var batch = super.checkHandlers(this.myMeta, this.myData, myoldval, mymodifieds, force);

        // Remove elements if they are too much
        if (this.limit && this.myMeta.sorted.length > this.limit) {
            var ks = this.myMeta.sorted;
            // How many to remove
            var toremove = ks.length - this.limit;

            // Find the keys to remove
            var remkeys = this.limitLast ? ks.slice(0,toremove) : ks.slice(-toremove);

            // Create a new value with k->undefined
            var remval :any = {};
            for (var i = 0; i < remkeys.length; i++) {
                remval[remkeys[i]] = undefined;
            }

            // The remove value extends the new valuefrom previous steps, and becomes the new data 
            setPrototypeOf(remval, mynewval);
            this.myData = remval;

            // Delegate all event stuff to usual method
            batch.merge(super.checkHandlers(this.myMeta, this.myData, mynewval, remkeys, false));
        }
        return batch;
    }

    markDone() {
        this.myMeta.incomplete = false;
        // Trigger value
        var valueHandlers = this.findByType('value');
        if (valueHandlers.length) {
            var event = [new RDb3Snap(this.myData, this.root, this.path), null];
            for (var i = 0; i < valueHandlers.length; i++) {
                valueHandlers[i].callback.apply(this.root, event);
            }
        }
    }

    queryExit(path :string) {
        var subp = path.substr(this.path.length);
        var leaf = Utils.leafPath(subp);
        var mynewval :any = {};
        mynewval[leaf] = null;

        // Make my new val extend my old val
        var myoldval = this.myData;
        setPrototypeOf(mynewval, myoldval);
        this.myData = mynewval;

        // Forward to super.checkHandlers using my meta and my values
        super.checkHandlers(this.myMeta, this.myData, myoldval, [leaf], false);
    }

    makeSorter() :SortFunction {
        var sortOn = this.sortField || this.compareField;
        if (!sortOn) return null;
        return (ka :string,kb :string)=>{
            var a = this.myData[ka];
            var b = this.myData[kb];
            // TODO should supports paths in compare fields?
            var va = a && a[sortOn];
            var vb = b && b[sortOn];
            if (va > vb) return 1;
            if (vb > va) return -1;
            // Fall back to key order if compareField is equal
            if (ka > kb) return 1;
            if (kb > ka) return -1;
            return 0;
        };
    }
}




export abstract class Handler {
    public _intid = 'h' + (prog++);
    public eventType: string;

    constructor(
        public callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void,
        public context: Object,
        public tree: RDb3Tree
    ) {
        //this.hook();
    }

    matches(eventType?: string, callback?: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, context?: Object) {
        if (context) {
            return this.eventType == eventType && this.callback === callback && this.context === context;
        } else if (callback) {
            return this.eventType == eventType && this.callback === callback;
        } else {
            return this.eventType == eventType;
        }
    }

    hook() {
        this.tree.getSubscription().add(this);
    }

    decommission() {
        this.tree.getSubscription().remove(this);
    }

    protected getValue() :any {
        return this.tree.getSubscription().getCurrentValue();
    }

    protected getMeta() :Metadata {
        return this.tree.getSubscription().getCurrentMeta();
    }

    abstract init() :void;
}

class ValueCbHandler extends Handler {
    hook() {
        this.eventType = 'value';
        super.hook();
    }

    init() {
        var acval = this.getValue();
        var meta = this.getMeta();
        var to = typeof(acval);
        // Send initial data if ...
        if (
            // ... it's a primitive value
            (to !== 'undefined' && to !== 'object')
            // ... there is a metadata declaring it complete
            || (meta && meta.incomplete === false)
            // ... is an explicit null
            || (acval === null)
        ) {
            dbgEvt('%s Send initial event %s : value %o', this._intid, this.tree.url, acval);
            this.callback(new RDb3Snap(acval, this.tree.root, this.tree.url, meta));
        } else {
            dbgEvt('%s Not sending initial value event, incomplete %s typeof %s', this._intid, (meta && meta.incomplete), typeof(acval));
        }
    }
}

class ChildAddedCbHandler extends Handler {
    hook() {
        this.eventType = 'child_added';
        super.hook();
    }

    init() {
        var acv = this.getValue();
        var mysnap = new RDb3Snap(acv, this.tree.root, this.tree.url, this.getMeta());
        var prek :string = null;
        mysnap.forEach((cs)=>{
            dbgEvt('%s Send initial event %s : child_added  %o', this._intid, <any>cs['url'], <any>cs['data']);
            this.callback(cs,prek);
            prek = cs.key();
            return false;
        });
    }
}

class ChildRemovedCbHandler extends Handler {
    hook() {
        this.eventType = 'child_removed';
        super.hook();
    }

    init() {
        // This event never triggers on init
    }
}

class ChildMovedCbHandler extends Handler {
    hook() {
        this.eventType = 'child_moved';
        super.hook();
    }

    init() {
        // This event never triggers on init
    }
}

class ChildChangedCbHandler extends Handler {
    hook() {
        this.eventType = 'child_changed';
        super.hook();
    }

    init() {
        // This event never triggers on init
    }
}

interface CbHandlerCtor {
    new (
        callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void,
        context: Object,
        tree: RDb3Tree
    ): Handler;
}

var cbHandlers = {
    value: ValueCbHandler,
    child_added: ChildAddedCbHandler,
    child_removed: ChildRemovedCbHandler,
    child_moved: ChildMovedCbHandler,
    child_changed: ChildChangedCbHandler
}


export class RDb3Snap implements Spi.DbTreeSnap {
    constructor(
        private data: any,
        private root: RDb3Root,
        private url: string,
        private meta? :Metadata
    ) {
    }

    exists(): boolean {
        return typeof (this.data) !== 'undefined' && this.data !== null;
    }

    val(): any {
        if (!this.exists()) return null;
        return this.data;
    }

    deepVal() :any {
        if (!this.exists()) return null;
        this.data = flatten(this.data);
        return this.data;
    }

    child(childPath: string): RDb3Snap {
        var subs = findChain(childPath, this.data, true, false);
        var suburl = this.url + Utils.normalizePath(childPath);
        var val = subs.pop();
        return new RDb3Snap(val, this.root, suburl, typeof(val) === 'object' ? this.root.getMetadata(suburl) : null);
    }

    forEach(childAction: (childSnapshot: RDb3Snap) => void): boolean;
    forEach(childAction: (childSnapshot: RDb3Snap) => boolean): boolean {
        if (!this.exists()) return;
        var ks :string[] = [];
        if (this.meta) {
            ks = this.meta.sorted;
        }
        if (!ks || !ks.length) {
            for (var k in this.data) {
                ks.push(k);
            }
            ks.sort();
        }
        for (var i = 0; i < ks.length; i++) {
            var child = this.child(ks[i]);
            if (!child.exists()) continue;
            if (childAction(child)) return true;
        }
        return false;
    }

    key(): string {
        return this.url.split('/').pop() || '';
    }

    ref(): RDb3Tree {
        return this.root.getUrl(this.url);
    }
}





/*
function getKeysOrdered(obj: any, fn?: SortFunction, otherObj? :any): string[] {
    if (!obj) return [];
    fn = fn || obj['$sorter'];
    var sortFn: SortFunction = null;
    if (fn) {
        sortFn = (a, b) => {
            var va = obj[a] || (otherObj ? otherObj[a] : null);
            var vb = obj[b] || (otherObj ? otherObj[b] : null);
            return fn(va, vb);
        };
    }
    var ret: string[] = [];
    for (var k in obj) {
        if (k.charAt(0) == '$') continue;
        if (obj[k] === undefined || obj[k] == KNOWN_NULL) continue;
        ret.push(k);
    }
    if (otherObj) {
        for (var k in otherObj) {
            if (k.charAt(0) == '$') continue;
            if (otherObj[k] === undefined || otherObj[k] == KNOWN_NULL) continue;
            ret.push(k);
        }
    }
    ret = ret.sort(sortFn);
    return ret;
}

function findPreviousKey(obj :any, k :string, otherObj? :any) :string {
    var ks = getKeysOrdered(obj, null, otherObj);
    var i = ks.indexOf(k);
    if (i<1) return null;
    return ks[i-1];
}
*/

namespace Utils {
    export function normalizePath(path: string) {
        path = path.replace(/\/\.+\//g, '/');
        path = path.replace(/\/\/+/g, '/');
        if (path.charAt(0) != '/') path = '/' + path;
        if (path.charAt(path.length - 1) == '/') path = path.substr(0, path.length - 1);
        return path;
    }

    export function leafPath(path: string): string {
        if (!path) return null;
        return path.substr(path.lastIndexOf('/') + 1);
    }

    export function parentPath(path: string): string {
        if (!path) return null;
        var ret = path.substr(0, path.lastIndexOf('/'));
        //if (ret.length == 0) return null;
        return ret;
    }

    export function isEmpty(obj :any) :boolean {
        for (var k in obj) {
            return false;
        }
        return true;
    }
}


function splitUrl(url: string) {
    return Utils.normalizePath(url).split('/');
}

function findChain<T>(url: string | string[], from: T, leaf = true, create = false): T[] {
    var sp: string[];
    if (typeof (url) === 'string') {
        sp = splitUrl(<string>url);
    } else {
        sp = <string[]>url;
    }
    var to = sp.length;
    if (!leaf) to--;
    var ret: T[] = [];
    var ac: any = from;
    ret.push(ac);
    for (var i = 0; i < to; i++) {
        if (sp[i].length == 0) continue;
        if (!create && typeof (ac) !== 'object') {
            ret.push(undefined);
            break;
            //return [undefined];
        }
        var pre = ac;
        ac = ac[sp[i]];
        if (typeof (ac) === 'undefined') {
            if (!create) {
                ret.push(undefined);
                break;
                //return [undefined];
            }
            ac = <T>{};
            pre[sp[i]] = ac;
        }
        ret.push(ac);
    }
    return ret;
}

function flatten(val :any) {
    if (val === null) return null;
    if (val === undefined) return undefined;
    if (typeof(val) !== 'object') return val;
    if (!getPrototypeOf(val)) return val;
    var ret :any = {};
    for (var k in val) {
        if (val[k] === undefined) continue;
        ret[k] = flatten(val[k]);
        if (val[k] === null) continue
    }
    return ret;
}


export class RDb3Tree implements Spi.DbTree, Spi.DbTreeQuery {

    constructor(
        public root: RDb3Root,
        public url: string
    ) {
        dbgTree('Created ' + url);
    }

    private cbs: Handler[] = [];
    private qsub: QuerySubscription = null;

    getSubscription(): Subscription {
        return this.qsub || this.root.subscribe(this.url);
    }

    on(eventType: string, callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, cancelCallback?: (error: any) => void, context?: Object): (dataSnapshot: RDb3Snap, prevChildName?: string) => void {
        var ctor: CbHandlerCtor = (<any>cbHandlers)[eventType];
        if (!ctor) {
            dbgTree("Cannot find event %s while trying to hook on %s", eventType, this.url);
            throw new Error("Cannot find event " + eventType);
        }
        dbgTree('Hooking %s : %s, before it has %s hooks', this.url, eventType, this.cbs.length);
        var handler = new ctor(callback, context, this);
        handler.hook();
        this.cbs.push(handler);
        // It's very important to init after hooking, since init causes sync event, that could cause an unhook, 
        // the unhook would be not possible/not effective if the handler is not found in the cbs list.
        handler.init();
        return callback;
    }

    off(eventType?: string, callback?: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, context?: Object): void {
        var prelen = this.cbs.length;
        this.cbs = this.cbs.filter((ach) => {
            if (!ach.matches(eventType, callback, context)) return true;
            ach.decommission();
            return false;
        });
        dbgTree('Unhooked %s : %s, before it had %s, now has %s hooks', this.url, eventType, prelen, this.cbs.length);
    }


    once(eventType: string, successCallback: (dataSnapshot: RDb3Snap) => void, context?: Object): void;
    once(eventType: string, successCallback: (dataSnapshot: RDb3Snap) => void, failureCallback?: (error: any) => void, context?: Object): void {
        var fn = this.on(eventType, (ds) => {
            this.off(eventType, fn);
            successCallback(ds);
        }, (err) => {
            if (failureCallback && context) {
                failureCallback(err);
            }
        }, context || failureCallback);
    }
    
    private subQuery() {
        var ret = new RDb3Tree(this.root, this.url);
        ret.qsub = new QuerySubscription(this.getSubscription());
        return ret;
    }

    /**
    * Generates a new Query object ordered by the specified child key.
    */
    orderByChild(key: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.compareField = key;
        return ret;
    }
    /**
    * Generates a new Query object ordered by key name.
    */
    orderByKey(): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.compareField = null;
        return ret;
    }

    /**
    * Creates a Query with the specified starting point. 
    * The generated Query includes children which match the specified starting point.
    */
    startAt(value: string | number, key?: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.from = value;
        return ret;
    }

    /**
    * Creates a Query with the specified ending point. 
    * The generated Query includes children which match the specified ending point.
    */
    endAt(value: string | number, key?: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.to = value;
        return ret;
    }

    /**
    * Creates a Query which includes children which match the specified value.
    */
    equalTo(value: string | number, key?: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.equals = value;
        return ret;
    }

    /**
    * Creates a Query which includes children which match one of the specified values.
    */
    valueIn(values: string[]| number[], key?: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.valuein = values;
        return ret;
    }


    /**
    * Generates a new Query object limited to the first certain number of children.
    */
    limitToFirst(limit: number): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.limit = limit;
        ret.qsub.limitLast = false;
        return ret;
    }
    /**
    * Generates a new Query object limited to the last certain number of children.
    */
    limitToLast(limit: number): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.limit = limit;
        ret.qsub.limitLast = true;
        return ret;
    }


    sortByChild(key: string): RDb3Tree {
        var ret = this.subQuery();
        ret.qsub.sortField = key;
        return ret;
    }

    /**
    * Gets the absolute URL corresponding to this DbTree reference's location.
    */
    toString(): string {
        return this.root.makeAbsolute(this.url);
    }

    /**
    * Writes data to this DbTree location.
    */
    set(value: any, onComplete?: (error: any) => void): void {
        // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
        this.root.startingWrite(this.url);
        var prog = this.root.nextProg();
        this.root.send('s', this.url, value, prog, (ack:string)=>{
            this.root.doneWrite(this.url);
            if (onComplete) {
                if (ack == 'k') {
                    onComplete(null);
                } else {
                    // TODO rollback local modifications in case of error?
                    onComplete(new Error(ack));
                }
            }
        });
        this.root.handleChange(this.url, value, prog);
    }

    /**
    * Writes the enumerated children to this DbTree location.
    */
    update(value: any, onComplete?: (error: any) => void): void {
        // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
        this.root.startingWrite(this.url);
        var prog = this.root.nextProg();
        this.root.send('m', this.url, value, prog, (ack:string)=>{
            this.root.doneWrite(this.url);
            if (onComplete) {
                if (ack == 'k') {
                    onComplete(null);
                } else {
                    // TODO rollback local modifications in case of error?
                    onComplete(new Error(ack));
                }
            }
        });
        for (var k in value) {
            this.root.handleChange(this.url + '/' + k, value[k], prog);
        }
    }

    /**
    * Removes the data at this DbTree location.
    */
    remove(onComplete?: (error: any) => void): void {
        this.set(null, onComplete);
    }

    child(path :string) {
        return new RDb3Tree(this.root, this.url + Utils.normalizePath(path));
    }

}


// Quick polyfill for nextTick

var nextTick = (function () {
	// Node.js
	if ((typeof process === 'object') && process && (typeof process.nextTick === 'function')) {
		return process.nextTick;
	}

	// W3C Draft
	// http://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html
	if (typeof setImmediate === 'function') {
		return (cb :Function) => { setImmediate(cb); };
	}

	// Wide available standard
	if ((typeof setTimeout === 'function') || (typeof setTimeout === 'object')) {
		return (cb :Function) => { setTimeout(cb, 0); };
	}

	return null;
}());


// Quick polyfill for setPrototypeOf and getPrototypeOf
var setPrototypeOf = (function() {

    function setProtoOf(obj :any, proto :any) {
        obj.__proto__ = proto;
    }

    function mixinProperties(obj :any, proto :any) {
        for (var prop in proto) {
            obj[prop] = proto[prop];
        }
    }

    if (Object.setPrototypeOf) return Object.setPrototypeOf;
    if ({__proto__:[]} instanceof Array) return setProtoOf;
    console.log("USING raw mixin for oject extension, will slow down things a lot");
    return mixinProperties;
}());

var getPrototypeOf = (function() {
    if (Object.getPrototypeOf) return Object.getPrototypeOf;

    function getProtoOf(obj :any) {
        return obj.__proto__;
    }

    function getConstructorProto(obj :any) {
        // May break if the constructor has been tampered with
        return obj.constructor.prototype;
    }

    if ({__proto__:[]} instanceof Array) return getProtoOf;
    return getConstructorProto;
}());