
/**
 * TSDB remote client VERSION_TAG 
 */

import {Spi,Api} from 'jsdb';

type BroadcastCb = (sub :Subscription, acpath :string, acval:any)=>void;

export interface WritingState {
    version? :number;
    incomplete? :boolean;
    hasChildChanged? :boolean;
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
        markIncomplete(this.data);
        if (sock) {
            sock.on('v', (msg:any)=>this.receivedValue(msg));
            sock.on('qd', (msg:any)=>this.receivedQueryDone(msg));
            sock.on('qx', (msg:any)=>this.receivedQueryExit(msg));
        }
    }

    private subscriptions :{[index:string]:Subscription} = {};
    private data :any;
    private queries :{[index:string]:QuerySubscription} = {};

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
        this.handleChange(msg.p, msg.v, msg.n);
        if (msg.q) {
            var val = msg.v;
            this.handleQueryChange(msg.q, msg.p, val, msg.n);
        }
    }

    receivedQueryDone(msg :any) {
        dbgIo('Received QueryDone for %s : %o', msg.q, msg);
        var qdef = this.queries[msg.q];
        if (!qdef) return;
        qdef.done = true;
        this.handleQueryChange(msg.q, qdef.path, {$i:true,$d:true}, this.writeProg);
    }

    receivedQueryExit(msg :any) {
        dbgIo('Received QueryExit v %s for "%s" : %o', msg.n, msg.q, msg);
        var qdef = this.queries[msg.q];
        if (!qdef) return;
        this.handleQueryChange(msg.q, msg.p, null, msg.n);
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

        var sp = splitUrl(path);
        var ch = findChain(sp, this.data);
        var leaf = Utils.leafPath(path);
        var lst = ch[ch.length - 1];

        // When path X is unsubscribed it :
        // .. Check if up the tree there is a subscription protecting this path
        //if (this.subscriptions['']) return;
        var acp = path;
        while (acp) {
            if (this.subscriptions[acp]) return;
            acp = Utils.parentPath(acp);
        }
        // .. Recurses down, invalidating any value that is not protected by a subscriptions
        if (lst) {
            this.recursiveClean(path, lst);
        }
        // .. Recurses up, invalidate any key that results in an empty object
        for (var i = ch.length - 1; i > 0; i--) {
            var ac = ch[i];
            var inpname = sp[i];
            if (typeof(ac) === 'object' && ac !== KNOWN_NULL) {
                dbgRoot("Recursing up, invalidating %s : %s", inpname);
                markIncomplete(ac);
            }
        }


        // TODO what is below is suboptimal
        /*
        Should not remove data, chldren of the path being unsubscribed, if they have their own listener.
        For example :
          sub : /list 
          val : /list = {a:1,b:2,c:3}
          sub : /list/a
          uns : /list ---> should remove /list/b and /list/c but not list/a since it has a listener there

        And :
          sub : /list 
          val : /list = {a:1,b:2,c:3}
          sub : /list/a
          uns : /list/a ---> should not remove anything, cause /list/a is being listened by /list 
          uns : /list -> now it can delete everything
        */ 
        /*
        if (path == '') {
            // Special case for root
            dbgRoot("Clearing all data, unsubscribed from root");
            this.data = {};
            markIncomplete(this.data);
        } else {
            var ch = findChain(Utils.parentPath(path), this.data);
            var leaf = Utils.leafPath(path);
            var lst = ch.pop();
            if (lst) {
                delete lst[leaf];
            }
        }
        */
    }

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

    subscribeQuery(query :QuerySubscription) {
        this.queries[query.id] = query;
        this.subscriptions['/q' + query.id] = query; 
    }

    unsubscribeQuery(id :string) {
        this.sendUnsubscribeQuery(id);
        delete this.queries[id];
        delete this.subscriptions['/q' + id];
        delete this.data['q' + id];
    }

    getValue(url: string | string[]) :any {
        var ret = findChain(url, this.data, true, false);
        return ret.pop();
    }

    handleChange(path :string, val :any, prog :number) {
        // Normalize the path to "/" by wrapping the val
        var nv :any = val;
        var sp = splitUrl(path);
        sp.splice(0,1);
        while (sp.length) {
            var nnv :any = {};
            nnv[sp.pop()] = nv;
            markIncomplete(nnv);
            nv = nnv;
        }

        this.recurseApplyBroadcast(nv, this.data, null, '', prog, {});

        // Special case for root
        if (val == null && path == '') {
            this.data = {};
        }

        /*
        if (val == null) {
            // Special case for root
            if (path == '') {
                this.data = {};
            } else {
                var ch = findChain(sp, this.data);
                // .. Recurses up, remove any key that results in an empty object
                for (var i = ch.length - 1; i > 0; i--) {
                    var ac = ch[i];
                    var par = ch[i-1];
                    var inpname = sp[i];
                    if (typeof(ac) === 'object' && Utils.isEmpty(ac)) {
                        delete par[inpname];
                    }
                }
            }
        }
        */
    }

    handleQueryChange(id :string, path :string, val :any, prog :number) {
        var def = this.queries[id];
        if (!def) {
            // TODO stale query, send unsubscribe again?
            return;
        }
        var subp = path.substr(def.path.length);
        var nv :any = val;
        var sp = splitUrl(subp);
        sp.splice(0,1);
        while (sp.length) {
            var nnv :any = {};
            nnv[sp.pop()] = nv;
            markIncomplete(nnv);
            nv = nnv;
        }
        nv.$l = !def.done;

        if (!this.data['q'+id]) this.data['q'+id] = {};
        nv['$sorter'] = this.data['q'+id]['$sorter'] = def.makeSorter();
        this.recurseApplyBroadcast(nv, this.data['q'+id], this.data, '/q'+id, prog, {}, def.path);

        if (def.limit) {
            var acdata = this.data['q'+id];
            var ks = getKeysOrdered(acdata);
            if (ks.length > def.limit) {
                var torem :any = {};
                while (ks.length > def.limit) {
                    var k = def.limitLast ? ks.shift() : ks.pop();
                    torem[k] = null;
                }
                markIncomplete(torem);
                // TODO probably here the version should not be prog, given that the deletion are based on the current situation
                this.recurseApplyBroadcast(torem, this.data['q'+id], this.data, '/q'+id, prog, {}, def.path);
            }
        }
    }

    recurseApplyBroadcast(newval :any, acval :any, parentval :any, path :string, version :number, state :WritingState, queryPath? :string) :boolean {
        var leaf = Utils.leafPath(path);
        if (newval !== null && typeof(newval) === 'object') {
            var newValIncomplete = isIncomplete(newval);
            var changed = false;
            // Change from native value to object
            if (acval === KNOWN_NULL || !acval || typeof(acval) !== 'object') {
                changed = true;
                acval = {};
                if (newValIncomplete) {
                    markIncomplete(acval);
                }
                parentval[leaf] = acval;
            }

            var acversions = getVersions(acval);
            var preHigher = acversions.$higher || 0;
            if (version > preHigher) {
                acversions.$higher = version;
            }

            if (!newValIncomplete && isIncomplete(acval, state)) {
                markComplete(acval);
                changed = true;
            }

            var sub = this.subscriptions[path];
            if (!state.hasChildChanged && !sub && !newValIncomplete && preHigher < version) {
                var hasGrandSubs = false;
                for (var k in this.subscriptions) {
                    if (k.indexOf(path) == 0) {
                        if (path == k) continue;
                        hasGrandSubs = true;
                    }
                }
                if (!hasGrandSubs) {
                    if (parentval) {
                        parentval[leaf] = newval;
                    } else {
                        for (var k in newval) {
                            acval[k] = newval[k]
                        }
                        for (var k in acval) {
                            if (typeof(newval[k]) !== 'undefined') continue;
                            delete acval[k];
                        }
                    }
                    return true;
                }
            }

            // Look children of the new value
            var nks = sub ? getKeysOrdered(newval) : Object.keys(newval);
            for (var nki = 0; nki < nks.length; nki++) {
                var k = nks[nki];
                if (k.charAt(0) == '$') continue;

                var newc = newval[k];
                var pre = acval[k];
                var prever = acversions[k] || state.version;


                dbgRoot("%s comparing prever %s->%s : %s->%s", path+'/'+k, prever, version,pre,newc);
                if (prever && prever > version) continue;

                var acstate :WritingState = {
                    version: prever,
                    incomplete: isIncomplete(acval, state),
                    hasChildChanged: state.hasChildChanged
                };
                
                if (!isIncomplete(newc)) {
                    acversions[k] = version;
                }
                if (newc === null) {
                    // Explicit delete
                    var presnap = new RDb3Snap(pre, this, (queryPath||path)+'/'+k);
                    if (this.recurseApplyBroadcast(newc, pre, acval, path +'/'+k, version, acstate)) {
                        if (sub && sub.types['child_removed']) {
                            this.broadcastChildRemoved(path, k, presnap, queryPath);
                        }
                        // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                        //this.broadcastChildMoved(path, k, acval[k]);
                        // If we are in a query, really remove the child, no need for KNOWN_NULL
                        if (queryPath) delete acval[k];
                        changed = true;
                    }
                } else if (pre === KNOWN_NULL || typeof(pre) === 'undefined') {
                    // Child added
                    pre = {};
                    if (isIncomplete(newc)) {
                        markIncomplete(pre);
                    }
                    acval[k] = pre;
                    if (this.recurseApplyBroadcast(newc, pre, acval, path +'/'+k, version, acstate)) {
                        changed = true;
                        if (sub && sub.types['child_added']) {
                            this.broadcastChildAdded(path, k, acval[k], queryPath, ()=>findPreviousKey(acval, k));
                        }
                    } else {
                        delete acval[k];
                    }
                } else {
                    // Maybe child changed
                    var prepre :string = null;
                    if (sub && sub.types['child_moved']) {
                        prepre = findPreviousKey(acval, k);
                    }
                    var preHasChildChanged = acstate.hasChildChanged;
                    if (sub) {
                        acstate.hasChildChanged = acstate.hasChildChanged || !!sub.types['child_changed'];
                    }
                    if (this.recurseApplyBroadcast(newc, pre, acval, path+'/'+k, version, acstate)) {
                        changed = true;
                        // Consider sorting and previous key
                        if (sub && (sub.types['child_moved'] || sub.types['child_changed'])) {
                            var acpre = findPreviousKey(acval, k);
                            this.broadcastChildChanged(path, k, acval[k], queryPath, ()=>acpre);
                            if (prepre != acpre) {
                                this.broadcastChildMoved(path, k, acval[k], queryPath, ()=>acpre);
                            }
                        }
                    }
                    acstate.hasChildChanged = preHasChildChanged;
                }
            }
            if (!newValIncomplete) {
                // If newc is not incomplete, delete all the other children
                for (var k in acval) {
                    if (k.charAt(0) == '$') continue;
                    if (newval[k] === null || typeof(newval[k]) === 'undefined') {
                        var prever = acversions[k];
                        if (prever && prever > version) continue;
                        var pre = acval[k];
                        acversions[k] = version;
                        var presnap :RDb3Snap = null;
                        if (sub && sub.types['child_removed']) {
                            presnap = new RDb3Snap(pre, this, (queryPath || path) + '/' + k);
                        }
                        if (this.recurseApplyBroadcast(null, pre, acval, path +'/'+k, version, acstate)) {
                            if (sub && sub.types['child_removed']) {
                                this.broadcastChildRemoved(path, k, presnap, queryPath);
                            }
                            // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                            //this.broadcastChildMoved(path, k, acval[k]);
                            changed = true;
                        }
                    }
                }
            }
            if ((changed && !newval.$l && !isIncomplete(acval, state)) || newval.$d) {
                if (sub && sub.types['value']) {
                    this.broadcastValue(path, acval, queryPath);
                }
            }
            /*
            for (var k in acval) {
                if (acval[k] !== KNOWN_NULL) return changed;
                if (this.subscriptions[path+'/'+k]) return changed;
            }
            if (parentval) {
                delete parentval[leaf];
            } else {
                this.data = {};
            }
            */
            return changed;
        } else {
            if (!parentval || !leaf) {
                // This happens when root is set to null
                this.broadcastValue(path, newval, queryPath);
                return true;
            }
            if (newval === null) {
                if (queryPath) {
                    // If in a query, don't use known nulls
                    if (parentval[leaf] != null) {
                        delete parentval[leaf];
                        this.broadcastValue(path, null, queryPath);
                        return true;
                    }
                } else {
                    if (parentval[leaf] != KNOWN_NULL) {
                        // keep "known missings", to avoid broadcasting this event over and over if it happens
                        parentval[leaf] = KNOWN_NULL;
                        this.broadcastValue(path, KNOWN_NULL, queryPath);
                        return !!acval;
                    }
                }
                // TODO propagate the nullification downwards to raise events on children, if any
            } else if (parentval[leaf] != newval) {
                parentval[leaf] = newval;
                this.broadcastValue(path, newval, queryPath);
                return true;
            }
            return false;
        }
    }

    private resolveChildName(prevChildName :()=>string) {

    }

    broadcastValue(path :string, val :any, queryPath :string) {
        this.broadcast(path, 'value', ()=>val instanceof RDb3Snap ? val : new RDb3Snap(val, this, queryPath || path));
    }

    broadcastChildAdded(path :string, child :string, val :any, queryPath :string, prevChildName? :()=>string) {
        this.broadcast(path, 'child_added', ()=>val instanceof RDb3Snap ? val : new RDb3Snap(val, this, (queryPath || path)+'/'+child), prevChildName);
    }

    broadcastChildChanged(path :string, child :string, val :any, queryPath :string, prevChildName? :()=>string) {
        this.broadcast(path, 'child_changed', ()=>val instanceof RDb3Snap ? val : new RDb3Snap(val, this, (queryPath || path)+'/'+child), prevChildName);
    }

    broadcastChildMoved(path :string, child :string, val :any, queryPath :string, prevChildName? :()=>string) {
        this.broadcast(path, 'child_moved', ()=>val instanceof RDb3Snap ? val : new RDb3Snap(val, this, (queryPath || path)+'/'+child), prevChildName);
    }

    broadcastChildRemoved(path :string, child :string, val :any, queryPath :string) {
        this.broadcast(path, 'child_removed', ()=>val instanceof RDb3Snap ? val : new RDb3Snap(val, this, (queryPath || path)+'/'+child));
    }

    broadcast(path :string, type :string, snapProvider :()=>RDb3Snap, prevChildName? :()=>string) {
        var sub = this.subscriptions[path];
        if (!sub) return;
        var handlers = sub.findByType(type);
        if (handlers.length == 0) return;
        var snap = snapProvider();
        dbgEvt('Send event %s %s:%o to %s handlers', path, type, <any>snap['data'], handlers.length);
        for (var i = 0; i < handlers.length; i++) {
            dbgEvt('%s sent event %s %s', handlers[i]._intid, path, type);
            handlers[i].callback(snap, prevChildName ? prevChildName() : null);
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
    } catch (e) {}
}




export class Subscription {

    constructor(public root :RDb3Root, public path :string) {

    }

    types :{[index:string]:number} = {};

    cbs: Handler[] = [];

    private sentSubscribe = false;
    private needSubscribe = false;

    add(cb: Handler) {
        dbgEvt("Adding handler %s from %s", cb._intid, this.path);
        if (this.cbs.length == 0) this.subscribe();
        this.cbs.push(cb);
        this.types[cb.eventType] = (this.types[cb.eventType] || 0) + 1; 
    }

    remove(cb: Handler) {
        this.cbs = this.cbs.filter((ocb) => ocb !== cb);
        dbgEvt("Removed handler %s from %s", cb._intid, this.path);
        if (this.cbs.length == 0) this.unsubscribe();
        this.types[cb.eventType] = (this.types[cb.eventType] || 1) - 1; 
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

    findByType(evtype :string) :Handler[] {
        return this.cbs.filter((ocb)=>ocb.eventType==evtype);
    }

    getCurrentValue() {
        return this.root.getValue(this.path);
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

    abstract init() :void;
}

class ValueCbHandler extends Handler {
    hook() {
        this.eventType = 'value';
        super.hook();
    }

    init() {
        var acval = this.getValue();
        if (acval !== null && typeof(acval) !== 'undefined' && !isIncomplete(acval)) {
            dbgEvt('%s Send initial event %s value:%o', this._intid, this.tree.url, acval);
            this.callback(new RDb3Snap(acval, this.tree.root, this.tree.url));
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
        var mysnap = new RDb3Snap(acv, this.tree.root, this.tree.url);
        var prek :string = null;
        mysnap.forEach((cs)=>{
            dbgEvt('%s Send initial event %s child_added:%o', this._intid, <any>cs['url'], <any>cs['data']);
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
        reclone = true
    ) {
        if (data === KNOWN_NULL) {
            this.data = null;
        } else if (data != null && typeof (data) !== undefined && reclone) {
            var str = JSON.stringify(data, (k,v)=>k.length && k.charAt(0) == '$' ? undefined : v);
            if (str === undefined || str === 'undefined') {
                this.data = undefined;
            } else if (str === null || str === 'null') {
                this.data = null;
            } else {
                this.data = JSON.parse(str);
            }
            
            if (data['$sorter']) this.data['$sorter'] = data['$sorter'];
        } else {
            this.data = data;
        }
    }

    exists(): boolean {
        return typeof (this.data) !== 'undefined' && this.data !== null;
    }

    val(): any {
        if (!this.exists()) return null;
        return JSON.parse(JSON.stringify(this.data));
    }
    child(childPath: string): RDb3Snap {
        var subs = findChain(childPath, this.data, true, false);
        return new RDb3Snap(subs.pop(), this.root, this.url + Utils.normalizePath(childPath), false);
    }

    // TODO ordering
    forEach(childAction: (childSnapshot: RDb3Snap) => void): boolean;
    forEach(childAction: (childSnapshot: RDb3Snap) => boolean): boolean {
        if (!this.exists()) return;
        var ks = getKeysOrdered(this.data);
        for (var i = 0; i < ks.length; i++) {
            if (childAction(this.child(ks[i]))) return true;
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


type SortFunction = (a: any, b: any) => number;

function getKeysOrdered(obj: any, fn?: SortFunction): string[] {
    if (!obj) return [];
    fn = fn || obj['$sorter'];
    var sortFn: SortFunction = null;
    if (fn) {
        sortFn = (a, b) => {
            return fn(obj[a], obj[b]);
        };
    }
    var ks = Object.keys(obj);
    var ret: string[] = [];
    for (var i = 0; i < ks.length; i++) {
        if (ks[i].charAt(0) == '$') continue;
        ret.push(ks[i]);
    }
    ret = ret.sort(sortFn);
    return ret;
}

function findPreviousKey(obj :any, k :string) :string {
    var ks = getKeysOrdered(obj);
    var i = ks.indexOf(k);
    if (i<1) return null;
    return ks[i-1];
}

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

function markIncomplete(obj :any) {
    if (obj && typeof(obj) === 'object') {
        obj['$i'] = true;
        //Object.defineProperty(obj, '$i', {enumerable:false, configurable:true, value:true});
    }
}

function markComplete(obj :any) {
    obj.$i = false;
    //Object.defineProperty(obj, '$i', {enumerable:false, value:false});
}


function isIncomplete(obj :any, state? :WritingState) :boolean {
    return (obj && typeof(obj) === 'object') ? !!obj['$i'] : state ? state.incomplete : false;
}

function getVersions(obj :any) :any {
    var ret = obj['$v'];
    if (!ret) {
        obj['$v'] = {};
        //Object.defineProperty(obj, '$v', {enumerable:false, configurable:true, value:{}});
        ret = obj['$v'];
    }
    return ret;
}


/*
export var KNOWN_NULL = {};
Object.defineProperty(KNOWN_NULL, 'toJSON', {enumerable:true, configurable:false, set:(v)=>{console.trace()}, get:()=>()=><any>undefined}); //, value:()=><any>undefined});
Object.defineProperty(KNOWN_NULL, '$i', {enumerable:true, configurable:false, set:(v)=>{console.trace()}, get:()=>false}); // writable:false, value:false});
*/

export var KNOWN_NULL = {};
Object.defineProperty(KNOWN_NULL, 'toJSON', {enumerable:true, configurable:false, writable:false, value:()=><any>undefined});
Object.defineProperty(KNOWN_NULL, '$i', {enumerable:true, configurable:false, writable:false, value:false});

/*
export var KNOWN_NULL = {
    toJSON: ()=><any>undefined,
    $i: false
};
*/


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
        dbgTree('Hooking %s to %s, before it has %s hooks', eventType, this.url, this.cbs.length);
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
        dbgTree('Unhooked %s from %s, before it had %s, now has %s hooks', eventType, this.url, prelen, this.cbs.length);
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
        //this.root.subscribe(this.url);
        var prog = this.root.nextProg();
        this.root.handleChange(this.url, value, prog);
        this.root.send('s', this.url, value, prog, (ack:string)=>{
            if (onComplete) {
                if (ack == 'k') {
                    onComplete(null);
                } else {
                    // TODO rollback local modifications in case of error?
                    onComplete(new Error(ack));
                }
            }
        });
    }

    /**
    * Writes the enumerated children to this DbTree location.
    */
    update(value: any, onComplete?: (error: any) => void): void {
        // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
        //this.root.subscribe(this.url);
        var prog = this.root.nextProg();
        for (var k in value) {
            this.root.handleChange(this.url + '/' + k, value[k], prog);
        }
        this.root.send('m', this.url, value, prog, (ack:string)=>{
            if (onComplete) {
                if (ack == 'k') {
                    onComplete(null);
                } else {
                    // TODO rollback local modifications in case of error?
                    onComplete(new Error(ack));
                }
            }
        });
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


var progQId = 1;

export class QuerySubscription extends Subscription {
    id: string = (progQId++)+'a';

    compareField: string = null;
    from: string | number;
    to: string | number;
    equals: string | number;
    limit: number = null;
    limitLast = false;

    done = false;

    constructor(oth: Subscription | QuerySubscription) {
        super(oth.root, oth.path);
        if (oth instanceof QuerySubscription) {
            this.compareField = oth.compareField;
            this.from = oth.from;
            this.to = oth.to;
            this.equals = oth.equals;
            this.limit = oth.limit;
            this.limitLast = oth.limitLast;
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
        return this.root.getValue('/q' + this.id);
    }

    makeSorter() {
        if (!this.compareField) return null;
        return (a :any,b :any)=>{
            var va = a[this.compareField];
            var vb = b[this.compareField];
            if (va > vb) return 1;
            if (vb > va) return -1;
            return 0;
        };
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