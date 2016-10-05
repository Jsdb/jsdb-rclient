/**
 * TSDB remote client 20161006_012312_master_1.0.0_6d788ac
 */
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
(function (factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        var v = factory(require, exports); if (v !== undefined) module.exports = v;
    }
        else if (typeof define === 'function' && define.amd) {
        define(["require", "exports"], factory);    } else {        var glb = typeof window !== 'undefined' ? window : global;        var exp = {};        glb['TsdbRClient'] = exp;        factory(null, exp);    }

})(function (require, exports) {
    "use strict";
    var EventsBatch = (function () {
        function EventsBatch(subscription) {
            this.subscription = subscription;
            this.events = {
                child_added: [],
                child_removed: [],
                child_changed: [],
                child_moved: [],
                value: []
            };
        }
        EventsBatch.prototype.merge = function (other) {
            for (var k in other.events) {
                var events = other.events[k];
                if (!events)
                    continue;
                for (var i = 0; i < events.length; i++) {
                    this.events[k].push(events[i]);
                }
            }
        };
        EventsBatch.prototype.send = function (toValue) {
            if (toValue === void 0) { toValue = false; }
            var cbs = this.subscription.cbs;
            // Dispatch the events to the handlers
            for (var i = 0; i < cbs.length; i++) {
                var cb = cbs[i];
                if (!toValue && cb.eventType == 'value')
                    continue;
                if (toValue && cb.eventType != 'value')
                    continue;
                var events = this.events[cb.eventType];
                if (events) {
                    // Sort events
                    events.sort(function (eva, evb) {
                        return eva[2] < evb[2] ? -1 : eva[2] == evb[2] ? 0 : 1;
                    });
                    for (var j = 0; j < events.length; j++) {
                        events[j].splice(2, 1);
                        dbgEvt("Dispatching event %s:%s to %s", this.subscription.path, cb.eventType, cb._intid);
                        cb.callback.apply(this.subscription.root, events[j]);
                    }
                }
            }
            if (!toValue)
                this.send(true);
        };
        return EventsBatch;
    }());
    exports.EventsBatch = EventsBatch;
    var MergeState = (function () {
        function MergeState() {
            this.writeVersion = 0;
            this.deepInspect = false;
            this.insideComplete = false;
            this.highest = 0;
            this.batches = [];
        }
        MergeState.prototype.derive = function () {
            var ret = new MergeState();
            ret.writeVersion = this.writeVersion;
            ret.deepInspect = this.deepInspect;
            ret.insideComplete = this.insideComplete;
            ret.highest = this.highest;
            ret.batches = this.batches;
            return ret;
        };
        MergeState.prototype.sendEvents = function () {
            for (var i = 0; i < this.batches.length; i++) {
                this.batches[i].send();
            }
        };
        return MergeState;
    }());
    exports.MergeState = MergeState;
    var Metadata = (function () {
        function Metadata() {
            this.versions = {};
            this.sorted = [];
            this.highest = 0;
            this.incomplete = null;
        }
        Metadata.prototype.binaryIndexOf = function (key, compare, arr) {
            if (arr === void 0) { arr = this.sorted; }
            if (!compare)
                compare = function (a, b) {
                    return (a < b) ? -1 : (a == b) ? 0 : 1;
                };
            var min = 0;
            var max = arr.length - 1;
            var guess;
            var c = 0;
            while (min <= max) {
                guess = Math.floor((min + max) / 2);
                c = compare(arr[guess], key);
                if (c === 0) {
                    return [true, guess];
                }
                else {
                    if (c < 0) {
                        min = guess + 1;
                    }
                    else {
                        max = guess - 1;
                    }
                }
            }
            return [false, c < 0 ? guess + 1 : guess];
        };
        Metadata.prototype.modifySorted = function (modifieds, added, compare) {
            var ret = [];
            // Find old positions for all non removed elements
            for (var i = 0; i < modifieds.length; i++) {
                if (added[i] === false) {
                    ret[i] = {};
                    continue;
                }
                var io = this.sorted.indexOf(modifieds[i]);
                if (io == -1) {
                    ret[i] = { prev: null };
                }
                else {
                    ret[i] = { prev: this.sorted[io - 1] };
                }
            }
            // Remove all elements
            for (var i = 0; i < modifieds.length; i++) {
                var io = this.sorted.indexOf(modifieds[i]);
                if (io == -1)
                    continue;
                this.sorted.splice(io, 1);
            }
            // Add new (or modified) elements
            for (var i = 0; i < modifieds.length; i++) {
                if (added[i] === false)
                    continue;
                var fnd = this.binaryIndexOf(modifieds[i], compare);
                if (fnd[0])
                    continue;
                this.sorted.splice(fnd[1], 0, modifieds[i]);
            }
            // Now compute new positions
            for (var i = 0; i < modifieds.length; i++) {
                if (added[i] === false)
                    continue;
                var fnd = this.binaryIndexOf(modifieds[i], compare);
                if (!fnd[0])
                    continue;
                ret[i].actual = this.sorted[fnd[1] - 1] || null;
                ret[i].index = fnd[1];
            }
            return ret;
        };
        return Metadata;
    }());
    exports.Metadata = Metadata;
    exports.VERSION = '20161006_012312_master_1.0.0_6d788ac';
    var noOpDbg = function () {
        var any = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            any[_i - 0] = arguments[_i];
        }
    };
    var dbgRoot = noOpDbg, dbgIo = noOpDbg, dbgTree = noOpDbg, dbgEvt = noOpDbg;
    var Debug = null;
    if (typeof (window) != 'undefined' && typeof (window['debug']) == 'function') {
        Debug = window['debug'];
    }
    else if (typeof (require) !== 'undefined') {
        try {
            var Debug = require('debug');
        }
        catch (e) {
        }
    }
    if (Debug) {
        dbgRoot = Debug('tsdb:rclient:root');
        dbgIo = Debug('tsdb:rclient:io');
        dbgTree = Debug('tsdb:rclient:tree');
        dbgEvt = Debug('tsdb:rclient:events');
    }
    var prog = 0;
    var RDb3Root = (function () {
        function RDb3Root(sock, baseUrl) {
            var _this = this;
            this.sock = sock;
            this.baseUrl = baseUrl;
            this.subscriptions = {};
            this.queries = {};
            this.metadata = {};
            this.doneProm = null;
            this.writeProg = 1;
            dbgRoot('Building root %s for socket %s', baseUrl, sock ? sock.id : 'NONE');
            this.data = {};
            this.getOrCreateMetadata('').incomplete = true;
            if (sock) {
                sock.on('v', function (msg) { return _this.receivedValue(msg); });
                sock.on('qd', function (msg) { return _this.receivedQueryDone(msg); });
                sock.on('qx', function (msg) { return _this.receivedQueryExit(msg); });
            }
        }
        RDb3Root.prototype.nextProg = function () {
            this.writeProg++;
            return this.writeProg;
        };
        RDb3Root.prototype.actualProg = function () {
            return this.writeProg;
        };
        RDb3Root.prototype.getUrl = function (url) {
            return new RDb3Tree(this, Utils.normalizePath(this.makeRelative(url)));
        };
        RDb3Root.prototype.makeRelative = function (url) {
            if (url.indexOf(this.baseUrl) != 0)
                return url;
            return "/" + url.substr(this.baseUrl.length);
        };
        RDb3Root.prototype.makeAbsolute = function (url) {
            return (this.baseUrl || '') + this.makeRelative(url);
        };
        RDb3Root.prototype.isReady = function () {
            return true;
        };
        RDb3Root.prototype.whenReady = function () {
            var _this = this;
            if (this.doneProm)
                return this.doneProm;
            if (this.sock) {
                dbgRoot('Asked when ready, creating promise');
                this.doneProm = new Promise(function (res, err) {
                    var to = setTimeout(function () {
                        dbgRoot('Message "aa" on the socket timedout after 30s');
                        err(new Error('Timeout'));
                    }, 30000);
                    _this.sock.on('aa', function () {
                        clearTimeout(to);
                        dbgRoot('Got "aa" message, root is now ready');
                        res();
                    });
                });
                return this.doneProm;
            }
            else {
                return Promise.resolve();
            }
        };
        RDb3Root.prototype.receivedValue = function (msg) {
            dbgIo('Received Value v %s for "%s" : %o', msg.n, msg.p, msg);
            this.handleChange(msg.p, msg.v, msg.n, msg.q);
        };
        RDb3Root.prototype.receivedQueryDone = function (msg) {
            dbgIo('Received QueryDone for %s : %o', msg.q, msg);
            var qdef = this.queries[msg.q];
            if (!qdef)
                return;
            qdef.markDone();
        };
        RDb3Root.prototype.receivedQueryExit = function (msg) {
            dbgIo('Received QueryExit v %s for "%s" : %o', msg.n, msg.q, msg);
            var qdef = this.queries[msg.q];
            if (!qdef)
                return;
            qdef.queryExit(msg.p);
        };
        RDb3Root.prototype.send = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            if (this.sock) {
                dbgIo('Sending %o', args);
                this.sock.emit.apply(this.sock, args);
            }
            else {
                dbgIo('NOT SENDING %o', args);
            }
        };
        RDb3Root.prototype.sendSubscribe = function (path) {
            this.send('sp', path);
        };
        RDb3Root.prototype.sendUnsubscribe = function (path) {
            this.send('up', path);
        };
        RDb3Root.prototype.sendSubscribeQuery = function (def) {
            var sdef = {
                id: def.id,
                path: def.path
            };
            if (def.compareField) {
                sdef.compareField = def.compareField;
            }
            if (typeof (def.equals) !== 'undefined') {
                sdef.equals = def.equals;
            }
            if (typeof (def.from) !== 'undefined') {
                sdef.from = def.from;
            }
            if (typeof (def.to) !== 'undefined') {
                sdef.to = def.to;
            }
            if (def.limit) {
                sdef.limit = def.limit;
                sdef.limitLast = def.limitLast;
            }
            this.send('sq', sdef);
        };
        RDb3Root.prototype.sendUnsubscribeQuery = function (id) {
            this.send('uq', id);
        };
        RDb3Root.prototype.subscribe = function (path) {
            path = Utils.normalizePath(path);
            var sub = this.subscriptions[path];
            if (!sub) {
                this.subscriptions[path] = sub = new Subscription(this, path);
            }
            return sub;
        };
        RDb3Root.prototype.unsubscribe = function (path) {
            delete this.subscriptions[path];
            /*
            var md = this.root.find(path);
            if (!md) return;
            md.subscription = null;
            */
            // TODO reimplement unsub policy
            /*
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
            */
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
        };
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
        RDb3Root.prototype.subscribeQuery = function (query) {
            this.queries[query.id] = query;
            this.subscriptions['/q' + query.id] = query;
        };
        RDb3Root.prototype.unsubscribeQuery = function (id) {
            this.sendUnsubscribeQuery(id);
            delete this.queries[id];
            delete this.subscriptions['/q' + id];
            //delete this.data['q' + id];
        };
        RDb3Root.prototype.getValue = function (url) {
            var ret = findChain(url, this.data, true, false);
            return ret.pop();
        };
        RDb3Root.prototype.getOrCreateMetadata = function (path, initing) {
            if (initing === void 0) { initing = true; }
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
        };
        RDb3Root.prototype.getMetadata = function (path) {
            return this.metadata[path];
        };
        RDb3Root.prototype.getNearestMetadata = function (path) {
            var ret = this.metadata[path];
            if (ret) {
                dbgRoot("Nearest metadata to %s is itself : %o", path, ret);
                return ret;
            }
            var fndpath = null;
            var acl = -1;
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
        };
        RDb3Root.prototype.handleChange = function (path, val, prog, queryId) {
            dbgRoot("Handling change on %s for prog %s (query %s)", path, prog, queryId);
            var querySub = null;
            if (queryId) {
                querySub = this.queries[queryId];
                if (!querySub) {
                }
            }
            // Normalize the path to "/" by wrapping the val
            var nv = val;
            var sp = splitUrl(path);
            sp.splice(0, 1);
            while (sp.length) {
                var nnv = {};
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
        };
        // TODO rewrite this completely
        /*
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
                nnv.$i = true;
                nv = nnv;
            }
            nv.$l = !def.done;
            
            if (!this.data['q'+id]) this.data['q'+id] = {};
            nv['$sorter'] = this.data['q'+id]['$sorter'] = def.makeSorter();
    
            var fnv :any = {};
            fnv['q' + id] = nv;
            fnv.$i = true;
    
            var state = new MergeState();
            state.writeVersion = prog;
            this.merge('/q' + id, nv, this.data['q'+id], state);
    
            delete nv.$l;
            this.data = fnv;
    
            if (def.limit) {
                var acdata = this.data['q'+id];
                // TODO replace with query metadata
                var ks = Object.keys(acdata); // getKeysOrdered(acdata);
                if (ks.length > def.limit) {
                    var torem :any = {};
                    while (ks.length > def.limit) {
                        var k = def.limitLast ? ks.shift() : ks.pop();
                        torem[k] = null;
                    }
                    torem.$i = true;
    
                    fnv = {};
                    fnv['q' + id] = torem;
                    fnv.$i = true;
                    // TODO what to pass here as a parentval??
                    // TODO probably here the sversion should not be prog, given that the deletion are based on the current situation
                    this.merge('/q' + id, torem, this.data['q'+id], state);
                    //this.recurseApplyBroadcast(torem, this.data['q'+id], fnv, '/q'+id, prog, {}, def.path);
                    this.data = fnv;
                }
            }
        }
        */
        RDb3Root.prototype.merge = function (path, newval, oldval, state, querySub) {
            var sub = this.subscriptions[path];
            var atQuery = querySub && (path == querySub.path);
            if (newval !== null && typeof (newval) === 'object') {
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
                    }
                    else {
                        meta.incomplete = !!newval.$i;
                    }
                }
                // Check if we can shortcut
                if (!state.deepInspect && !sub && !atQuery && !newval.$i && preHighest <= state.writeVersion) {
                    // Look for subscriptions in children and below
                    var hasGrandSubs = false;
                    for (var k in this.subscriptions) {
                        if (k.indexOf(path) == 0) {
                            if (path == k)
                                continue;
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
                                if (path == k)
                                    continue;
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
                var modifieds = [];
                for (var k in newval) {
                    if (k.charAt(0) == '$')
                        continue;
                    if (meta.versions[k] > state.writeVersion) {
                        // Current version is newer than the write version, delete the write
                        delete newval[k];
                    }
                    else {
                        // If the child is complete, we can update its version
                        if (newval[k] && !newval[k].$i) {
                            meta.versions[k] = state.writeVersion;
                        }
                        if (this.merge(path + '/' + k, newval[k], oldval ? oldval[k] : null, substate, querySub)) {
                            modifieds.push(k);
                            if (newval[k] === null) {
                                //meta.knownNull = true;
                                newval[k] = undefined;
                            }
                        }
                    }
                }
                // If the new object is complete, nullify previously existing keys that are not found now
                if (!newval.$i) {
                    for (var k in oldval) {
                        if (k.charAt(0) == '$')
                            continue;
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
            }
            else {
                // We are handling a leaf value
                if (sub)
                    state.batches.push(sub.checkHandlers(null, newval, oldval, null, false));
                // TODO this should never happen, value of a query with a single leaf primitive value??
                if (atQuery)
                    state.batches.push(querySub.checkHandlers(null, newval, oldval, null, false));
                return newval != oldval;
            }
        };
        RDb3Root.create = function (conf) {
            if (!conf.socket) {
                if (!conf.baseUrl)
                    throw Error("Configure RClient with either 'socket' or 'baseUrl'");
                if (typeof (io) === 'function') {
                    conf.socket = io(conf.baseUrl);
                }
                else {
                    throw new Error("Cannot find Socket.IO to start a connection to " + conf.baseUrl);
                }
            }
            var ret = conf.socket.Db3Root || new RDb3Root(conf.socket, conf.baseUrl);
            conf.socket.Db3Root = ret;
            return ret;
        };
        return RDb3Root;
    }());
    exports.RDb3Root = RDb3Root;
    var glb = typeof window !== 'undefined' ? window : global;
    if (glb || typeof (require) !== 'undefined') {
        try {
            var TsdbImpl = glb['Tsdb'] || require('jsdb');
            TsdbImpl.Spi.registry['rclient'] = RDb3Root.create;
        }
        catch (e) {
            console.log(e);
        }
    }
    var Subscription = (function () {
        function Subscription(root, path) {
            this.root = root;
            this.path = path;
            this.types = {};
            this.cbs = [];
            this.sentSubscribe = false;
            this.needSubscribe = false;
        }
        Subscription.prototype.add = function (cb) {
            dbgEvt("Adding handler %s %s to %s", cb._intid, cb.eventType, this.path);
            this.cbs.push(cb);
            this.types[cb.eventType] = (this.types[cb.eventType] || 0) + 1;
            if (this.cbs.length == 1)
                this.subscribe();
        };
        Subscription.prototype.remove = function (cb) {
            this.cbs = this.cbs.filter(function (ocb) { return ocb !== cb; });
            dbgEvt("Removed handler %s %s from %s", cb._intid, cb.eventType, this.path);
            this.types[cb.eventType] = (this.types[cb.eventType] || 1) - 1;
            if (this.cbs.length == 0)
                this.unsubscribe();
        };
        Subscription.prototype.subscribe = function () {
            var _this = this;
            dbgEvt("Subscribing to %s", this.path);
            this.needSubscribe = true;
            nextTick(function () {
                if (_this.sentSubscribe)
                    return;
                if (_this.needSubscribe) {
                    dbgEvt("Subscribe to %s not cancelled", _this.path);
                    _this.root.sendSubscribe(_this.path);
                    _this.sentSubscribe = true;
                }
            });
        };
        Subscription.prototype.unsubscribe = function () {
            var _this = this;
            dbgEvt("Unsubscribing to %s", this.path);
            var prog = this.root.actualProg();
            this.needSubscribe = false;
            nextTick(function () {
                if (_this.needSubscribe)
                    return;
                _this.root.unsubscribe(_this.path);
                if (_this.sentSubscribe) {
                    _this.root.sendUnsubscribe(_this.path);
                    _this.sentSubscribe = false;
                }
            });
        };
        Subscription.prototype.checkHandlers = function (meta, newval, oldval, modified, force) {
            var batch = new EventsBatch(this);
            if (meta) {
                // Update the metadata with current keys
                var added = [];
                for (var i = 0; i < modified.length; i++) {
                    var k = modified[i];
                    if (oldval && typeof (oldval[k]) !== 'undefined') {
                        if (!newval || typeof (newval[k]) === 'undefined') {
                            added[i] = false;
                        }
                    }
                    else if (newval && typeof (newval[k]) !== 'undefined') {
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
                    }
                    else if (added[i] === false) {
                        batch.events.child_removed.push([new RDb3Snap(oldval[k], this.root, this.path + '/' + k), null, 0]);
                    }
                    else {
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
                    if (newval && typeof (newval) === 'object') {
                        if ((!modified || modified.length == 0) || meta.incomplete) {
                            dbgEvt("Not notifying %s:value because modified %s or incomplete %s", this.path, modified && modified.length, meta.incomplete);
                            return batch;
                        }
                    }
                    else {
                        if (newval === null) {
                            if (oldval === null) {
                                dbgEvt("Not notifying %s:value both are nulls", this.path);
                                return batch;
                            }
                        }
                        else if (newval === undefined) {
                        }
                        else {
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
        };
        Subscription.prototype.findByType = function (evtype) {
            return this.cbs.filter(function (ocb) { return ocb.eventType == evtype; });
        };
        Subscription.prototype.getCurrentValue = function () {
            return this.root.getValue(this.path);
        };
        Subscription.prototype.getCurrentMeta = function () {
            return this.root.getOrCreateMetadata(this.path);
        };
        Subscription.prototype.makeSorter = function () {
            return null;
        };
        return Subscription;
    }());
    exports.Subscription = Subscription;
    var progQId = 1;
    var QuerySubscription = (function (_super) {
        __extends(QuerySubscription, _super);
        function QuerySubscription(oth) {
            _super.call(this, oth.root, oth.path);
            this.id = (progQId++) + 'a';
            this.compareField = null;
            this.limit = null;
            this.limitLast = false;
            //done = false;
            this.myData = {};
            this.myMeta = new Metadata();
            this.myMeta.incomplete = true;
            if (oth instanceof QuerySubscription) {
                this.compareField = oth.compareField;
                this.from = oth.from;
                this.to = oth.to;
                this.equals = oth.equals;
                this.limit = oth.limit;
                this.limitLast = oth.limitLast;
            }
        }
        QuerySubscription.prototype.add = function (cb) {
            _super.prototype.add.call(this, cb);
        };
        QuerySubscription.prototype.remove = function (cb) {
            _super.prototype.remove.call(this, cb);
        };
        QuerySubscription.prototype.subscribe = function () {
            this.root.subscribeQuery(this);
            this.root.sendSubscribeQuery(this);
        };
        QuerySubscription.prototype.unsubscribe = function () {
            this.root.unsubscribeQuery(this.id);
        };
        QuerySubscription.prototype.getCurrentValue = function () {
            return this.myData;
        };
        QuerySubscription.prototype.getCurrentMeta = function () {
            return this.myMeta;
        };
        // Trick into thinking there is no value handler if query is not finished yet
        QuerySubscription.prototype.findByType = function (evtype) {
            if (evtype == 'value' && this.myMeta.incomplete)
                return [];
            return _super.prototype.findByType.call(this, evtype);
        };
        // We handle this a bit differently for queries
        QuerySubscription.prototype.checkHandlers = function (meta, newval, oldval, modified, force) {
            // Copy from new val to my new val, only own values
            var mynewval = {};
            // TODO maybe use modified?
            var nks = Object.getOwnPropertyNames(newval);
            var mymodifieds = [];
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
            var batch = _super.prototype.checkHandlers.call(this, this.myMeta, this.myData, myoldval, mymodifieds, force);
            // Remove elements if they are too much
            if (this.limit && this.myMeta.sorted.length > this.limit) {
                var ks = this.myMeta.sorted;
                // How many to remove
                var toremove = ks.length - this.limit;
                // Find the keys to remove
                var remkeys = this.limitLast ? ks.slice(0, toremove) : ks.slice(-toremove);
                // Create a new value with k->undefined
                var remval = {};
                for (var i = 0; i < remkeys.length; i++) {
                    remval[remkeys[i]] = undefined;
                }
                // The remove value extends the new valuefrom previous steps, and becomes the new data 
                setPrototypeOf(remval, mynewval);
                this.myData = remval;
                // Delegate all event stuff to usual method
                batch.merge(_super.prototype.checkHandlers.call(this, this.myMeta, this.myData, mynewval, remkeys, false));
            }
            return batch;
        };
        QuerySubscription.prototype.markDone = function () {
            this.myMeta.incomplete = false;
            // Trigger value
            var valueHandlers = this.findByType('value');
            if (valueHandlers.length) {
                var event = [new RDb3Snap(this.myData, this.root, this.path), null];
                for (var i = 0; i < valueHandlers.length; i++) {
                    valueHandlers[i].callback.apply(this.root, event);
                }
            }
        };
        QuerySubscription.prototype.queryExit = function (path) {
            var subp = path.substr(this.path.length);
            var leaf = Utils.leafPath(subp);
            var mynewval = {};
            mynewval[leaf] = null;
            // Make my new val extend my old val
            var myoldval = this.myData;
            setPrototypeOf(mynewval, myoldval);
            this.myData = mynewval;
            // Forward to super.checkHandlers using my meta and my values
            _super.prototype.checkHandlers.call(this, this.myMeta, this.myData, myoldval, [leaf], false);
        };
        QuerySubscription.prototype.makeSorter = function () {
            var _this = this;
            if (!this.compareField)
                return null;
            return function (ka, kb) {
                var a = _this.myData[ka];
                var b = _this.myData[kb];
                // TODO should supports paths in compare fields?
                var va = a[_this.compareField];
                var vb = b[_this.compareField];
                if (va > vb)
                    return 1;
                if (vb > va)
                    return -1;
                // Fall back to key order if compareField is equal
                if (ka > kb)
                    return 1;
                if (kb > ka)
                    return -1;
                return 0;
            };
        };
        return QuerySubscription;
    }(Subscription));
    exports.QuerySubscription = QuerySubscription;
    var Handler = (function () {
        function Handler(callback, context, tree) {
            this.callback = callback;
            this.context = context;
            this.tree = tree;
            this._intid = 'h' + (prog++);
            //this.hook();
        }
        Handler.prototype.matches = function (eventType, callback, context) {
            if (context) {
                return this.eventType == eventType && this.callback === callback && this.context === context;
            }
            else if (callback) {
                return this.eventType == eventType && this.callback === callback;
            }
            else {
                return this.eventType == eventType;
            }
        };
        Handler.prototype.hook = function () {
            this.tree.getSubscription().add(this);
        };
        Handler.prototype.decommission = function () {
            this.tree.getSubscription().remove(this);
        };
        Handler.prototype.getValue = function () {
            return this.tree.getSubscription().getCurrentValue();
        };
        Handler.prototype.getMeta = function () {
            return this.tree.getSubscription().getCurrentMeta();
        };
        return Handler;
    }());
    exports.Handler = Handler;
    var ValueCbHandler = (function (_super) {
        __extends(ValueCbHandler, _super);
        function ValueCbHandler() {
            _super.apply(this, arguments);
        }
        ValueCbHandler.prototype.hook = function () {
            this.eventType = 'value';
            _super.prototype.hook.call(this);
        };
        ValueCbHandler.prototype.init = function () {
            var acval = this.getValue();
            var meta = this.getMeta();
            var to = typeof (acval);
            // Send initial data if ...
            if (
            // ... it's a primitive value
            (to !== 'undefined' && to !== 'object')
                || (meta && meta.incomplete === false)
                || (acval === null)) {
                dbgEvt('%s Send initial event %s : value %o', this._intid, this.tree.url, acval);
                this.callback(new RDb3Snap(acval, this.tree.root, this.tree.url, meta));
            }
            else {
                dbgEvt('%s Not sending initial value event, incomplete %s typeof %s', this._intid, (meta && meta.incomplete), typeof (acval));
            }
        };
        return ValueCbHandler;
    }(Handler));
    var ChildAddedCbHandler = (function (_super) {
        __extends(ChildAddedCbHandler, _super);
        function ChildAddedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildAddedCbHandler.prototype.hook = function () {
            this.eventType = 'child_added';
            _super.prototype.hook.call(this);
        };
        ChildAddedCbHandler.prototype.init = function () {
            var _this = this;
            var acv = this.getValue();
            var mysnap = new RDb3Snap(acv, this.tree.root, this.tree.url, this.getMeta());
            var prek = null;
            mysnap.forEach(function (cs) {
                dbgEvt('%s Send initial event %s : child_added  %o', _this._intid, cs['url'], cs['data']);
                _this.callback(cs, prek);
                prek = cs.key();
                return false;
            });
        };
        return ChildAddedCbHandler;
    }(Handler));
    var ChildRemovedCbHandler = (function (_super) {
        __extends(ChildRemovedCbHandler, _super);
        function ChildRemovedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildRemovedCbHandler.prototype.hook = function () {
            this.eventType = 'child_removed';
            _super.prototype.hook.call(this);
        };
        ChildRemovedCbHandler.prototype.init = function () {
            // This event never triggers on init
        };
        return ChildRemovedCbHandler;
    }(Handler));
    var ChildMovedCbHandler = (function (_super) {
        __extends(ChildMovedCbHandler, _super);
        function ChildMovedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildMovedCbHandler.prototype.hook = function () {
            this.eventType = 'child_moved';
            _super.prototype.hook.call(this);
        };
        ChildMovedCbHandler.prototype.init = function () {
            // This event never triggers on init
        };
        return ChildMovedCbHandler;
    }(Handler));
    var ChildChangedCbHandler = (function (_super) {
        __extends(ChildChangedCbHandler, _super);
        function ChildChangedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildChangedCbHandler.prototype.hook = function () {
            this.eventType = 'child_changed';
            _super.prototype.hook.call(this);
        };
        ChildChangedCbHandler.prototype.init = function () {
            // This event never triggers on init
        };
        return ChildChangedCbHandler;
    }(Handler));
    var cbHandlers = {
        value: ValueCbHandler,
        child_added: ChildAddedCbHandler,
        child_removed: ChildRemovedCbHandler,
        child_moved: ChildMovedCbHandler,
        child_changed: ChildChangedCbHandler
    };
    var RDb3Snap = (function () {
        function RDb3Snap(data, root, url, meta) {
            this.data = data;
            this.root = root;
            this.url = url;
            this.meta = meta;
        }
        RDb3Snap.prototype.exists = function () {
            return typeof (this.data) !== 'undefined' && this.data !== null;
        };
        RDb3Snap.prototype.val = function () {
            if (!this.exists())
                return null;
            return this.data;
        };
        RDb3Snap.prototype.deepVal = function () {
            if (!this.exists())
                return null;
            this.data = flatten(this.data);
            return this.data;
        };
        RDb3Snap.prototype.child = function (childPath) {
            var subs = findChain(childPath, this.data, true, false);
            var suburl = this.url + Utils.normalizePath(childPath);
            var val = subs.pop();
            return new RDb3Snap(val, this.root, suburl, typeof (val) === 'object' ? this.root.getMetadata(suburl) : null);
        };
        RDb3Snap.prototype.forEach = function (childAction) {
            if (!this.exists())
                return;
            var ks = [];
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
                if (!child.exists())
                    continue;
                if (childAction(child))
                    return true;
            }
            return false;
        };
        RDb3Snap.prototype.key = function () {
            return this.url.split('/').pop() || '';
        };
        RDb3Snap.prototype.ref = function () {
            return this.root.getUrl(this.url);
        };
        return RDb3Snap;
    }());
    exports.RDb3Snap = RDb3Snap;
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
    var Utils;
    (function (Utils) {
        function normalizePath(path) {
            path = path.replace(/\/\.+\//g, '/');
            path = path.replace(/\/\/+/g, '/');
            if (path.charAt(0) != '/')
                path = '/' + path;
            if (path.charAt(path.length - 1) == '/')
                path = path.substr(0, path.length - 1);
            return path;
        }
        Utils.normalizePath = normalizePath;
        function leafPath(path) {
            if (!path)
                return null;
            return path.substr(path.lastIndexOf('/') + 1);
        }
        Utils.leafPath = leafPath;
        function parentPath(path) {
            if (!path)
                return null;
            var ret = path.substr(0, path.lastIndexOf('/'));
            //if (ret.length == 0) return null;
            return ret;
        }
        Utils.parentPath = parentPath;
        function isEmpty(obj) {
            for (var k in obj) {
                return false;
            }
            return true;
        }
        Utils.isEmpty = isEmpty;
    })(Utils || (Utils = {}));
    function splitUrl(url) {
        return Utils.normalizePath(url).split('/');
    }
    function findChain(url, from, leaf, create) {
        if (leaf === void 0) { leaf = true; }
        if (create === void 0) { create = false; }
        var sp;
        if (typeof (url) === 'string') {
            sp = splitUrl(url);
        }
        else {
            sp = url;
        }
        var to = sp.length;
        if (!leaf)
            to--;
        var ret = [];
        var ac = from;
        ret.push(ac);
        for (var i = 0; i < to; i++) {
            if (sp[i].length == 0)
                continue;
            if (!create && typeof (ac) !== 'object') {
                ret.push(undefined);
                break;
            }
            var pre = ac;
            ac = ac[sp[i]];
            if (typeof (ac) === 'undefined') {
                if (!create) {
                    ret.push(undefined);
                    break;
                }
                ac = {};
                pre[sp[i]] = ac;
            }
            ret.push(ac);
        }
        return ret;
    }
    function flatten(val) {
        if (val === null)
            return null;
        if (val === undefined)
            return undefined;
        if (typeof (val) !== 'object')
            return val;
        if (!getPrototypeOf(val))
            return val;
        var ret = {};
        for (var k in val) {
            if (val[k] === undefined)
                continue;
            ret[k] = flatten(val[k]);
            if (val[k] === null)
                continue;
        }
        return ret;
    }
    var RDb3Tree = (function () {
        function RDb3Tree(root, url) {
            this.root = root;
            this.url = url;
            this.cbs = [];
            this.qsub = null;
            dbgTree('Created ' + url);
        }
        RDb3Tree.prototype.getSubscription = function () {
            return this.qsub || this.root.subscribe(this.url);
        };
        RDb3Tree.prototype.on = function (eventType, callback, cancelCallback, context) {
            var ctor = cbHandlers[eventType];
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
        };
        RDb3Tree.prototype.off = function (eventType, callback, context) {
            var prelen = this.cbs.length;
            this.cbs = this.cbs.filter(function (ach) {
                if (!ach.matches(eventType, callback, context))
                    return true;
                ach.decommission();
                return false;
            });
            dbgTree('Unhooked %s : %s, before it had %s, now has %s hooks', this.url, eventType, prelen, this.cbs.length);
        };
        RDb3Tree.prototype.once = function (eventType, successCallback, failureCallback, context) {
            var _this = this;
            var fn = this.on(eventType, function (ds) {
                _this.off(eventType, fn);
                successCallback(ds);
            }, function (err) {
                if (failureCallback && context) {
                    failureCallback(err);
                }
            }, context || failureCallback);
        };
        RDb3Tree.prototype.subQuery = function () {
            var ret = new RDb3Tree(this.root, this.url);
            ret.qsub = new QuerySubscription(this.getSubscription());
            return ret;
        };
        /**
        * Generates a new Query object ordered by the specified child key.
        */
        RDb3Tree.prototype.orderByChild = function (key) {
            var ret = this.subQuery();
            ret.qsub.compareField = key;
            return ret;
        };
        /**
        * Generates a new Query object ordered by key name.
        */
        RDb3Tree.prototype.orderByKey = function () {
            var ret = this.subQuery();
            ret.qsub.compareField = null;
            return ret;
        };
        /**
        * Creates a Query with the specified starting point.
        * The generated Query includes children which match the specified starting point.
        */
        RDb3Tree.prototype.startAt = function (value, key) {
            var ret = this.subQuery();
            ret.qsub.from = value;
            return ret;
        };
        /**
        * Creates a Query with the specified ending point.
        * The generated Query includes children which match the specified ending point.
        */
        RDb3Tree.prototype.endAt = function (value, key) {
            var ret = this.subQuery();
            ret.qsub.to = value;
            return ret;
        };
        /**
        * Creates a Query which includes children which match the specified value.
        */
        RDb3Tree.prototype.equalTo = function (value, key) {
            var ret = this.subQuery();
            ret.qsub.equals = value;
            return ret;
        };
        /**
        * Generates a new Query object limited to the first certain number of children.
        */
        RDb3Tree.prototype.limitToFirst = function (limit) {
            var ret = this.subQuery();
            ret.qsub.limit = limit;
            ret.qsub.limitLast = false;
            return ret;
        };
        /**
        * Generates a new Query object limited to the last certain number of children.
        */
        RDb3Tree.prototype.limitToLast = function (limit) {
            var ret = this.subQuery();
            ret.qsub.limit = limit;
            ret.qsub.limitLast = true;
            return ret;
        };
        /**
        * Gets the absolute URL corresponding to this DbTree reference's location.
        */
        RDb3Tree.prototype.toString = function () {
            return this.root.makeAbsolute(this.url);
        };
        /**
        * Writes data to this DbTree location.
        */
        RDb3Tree.prototype.set = function (value, onComplete) {
            // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
            //this.root.subscribe(this.url);
            var prog = this.root.nextProg();
            this.root.send('s', this.url, value, prog, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        // TODO rollback local modifications in case of error?
                        onComplete(new Error(ack));
                    }
                }
            });
            this.root.handleChange(this.url, value, prog);
        };
        /**
        * Writes the enumerated children to this DbTree location.
        */
        RDb3Tree.prototype.update = function (value, onComplete) {
            // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
            //this.root.subscribe(this.url);
            var prog = this.root.nextProg();
            this.root.send('m', this.url, value, prog, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        // TODO rollback local modifications in case of error?
                        onComplete(new Error(ack));
                    }
                }
            });
            for (var k in value) {
                this.root.handleChange(this.url + '/' + k, value[k], prog);
            }
        };
        /**
        * Removes the data at this DbTree location.
        */
        RDb3Tree.prototype.remove = function (onComplete) {
            this.set(null, onComplete);
        };
        RDb3Tree.prototype.child = function (path) {
            return new RDb3Tree(this.root, this.url + Utils.normalizePath(path));
        };
        return RDb3Tree;
    }());
    exports.RDb3Tree = RDb3Tree;
    // Quick polyfill for nextTick
    var nextTick = (function () {
        // Node.js
        if ((typeof process === 'object') && process && (typeof process.nextTick === 'function')) {
            return process.nextTick;
        }
        // W3C Draft
        // http://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html
        if (typeof setImmediate === 'function') {
            return function (cb) { setImmediate(cb); };
        }
        // Wide available standard
        if ((typeof setTimeout === 'function') || (typeof setTimeout === 'object')) {
            return function (cb) { setTimeout(cb, 0); };
        }
        return null;
    }());
    // Quick polyfill for setPrototypeOf and getPrototypeOf
    var setPrototypeOf = (function () {
        function setProtoOf(obj, proto) {
            obj.__proto__ = proto;
        }
        function mixinProperties(obj, proto) {
            for (var prop in proto) {
                obj[prop] = proto[prop];
            }
        }
        if (Object.setPrototypeOf)
            return Object.setPrototypeOf;
        if ({ __proto__: [] } instanceof Array)
            return setProtoOf;
        console.log("USING raw mixin for oject extension, will slow down things a lot");
        return mixinProperties;
    }());
    var getPrototypeOf = (function () {
        if (Object.getPrototypeOf)
            return Object.getPrototypeOf;
        function getProtoOf(obj) {
            return obj.__proto__;
        }
        function getConstructorProto(obj) {
            // May break if the constructor has been tampered with
            return obj.constructor.prototype;
        }
        if ({ __proto__: [] } instanceof Array)
            return getProtoOf;
        return getConstructorProto;
    }());
});

//# sourceMappingURL=Client.js.map
