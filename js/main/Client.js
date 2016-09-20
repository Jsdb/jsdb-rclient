/**
 * TSDB remote client 20160919_192747_master_1.0.0_ddf69f0
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
    exports.VERSION = '20160919_192747_master_1.0.0_ddf69f0';
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
            this.doneProm = null;
            this.writeProg = 1;
            dbgRoot('Building root %s for socket %s', baseUrl, sock ? sock.id : 'NONE');
            this.data = {};
            markIncomplete(this.data);
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
            this.handleChange(msg.p, msg.v, msg.n);
            if (msg.q) {
                var val = msg.v;
                this.handleQueryChange(msg.q, msg.p, val, msg.n);
            }
        };
        RDb3Root.prototype.receivedQueryDone = function (msg) {
            dbgIo('Received QueryDone for %s : %o', msg.q, msg);
            var qdef = this.queries[msg.q];
            if (!qdef)
                return;
            qdef.done = true;
            this.handleQueryChange(msg.q, qdef.path, { $i: true, $d: true }, this.writeProg);
        };
        RDb3Root.prototype.receivedQueryExit = function (msg) {
            dbgIo('Received QueryExit v %s for "%s" : %o', msg.n, msg.q, msg);
            var qdef = this.queries[msg.q];
            if (!qdef)
                return;
            this.handleQueryChange(msg.q, msg.p, null, msg.n);
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
            var sp = splitUrl(path);
            var ch = findChain(sp, this.data);
            var leaf = Utils.leafPath(path);
            var lst = ch[ch.length - 1];
            // When path X is unsubscribed it :
            // .. Check if up the tree there is a subscription protecting this path
            //if (this.subscriptions['']) return;
            var acp = path;
            while (acp) {
                if (this.subscriptions[acp])
                    return;
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
                if (typeof (ac) === 'object' && ac !== exports.KNOWN_NULL) {
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
        };
        RDb3Root.prototype.recursiveClean = function (path, val) {
            if (typeof (val) !== 'object')
                return;
            if (val === exports.KNOWN_NULL)
                return;
            dbgRoot("Recursing down, invalidating %s", path);
            markIncomplete(val);
            for (var k in val) {
                var subp = path + '/' + k;
                if (this.subscriptions[subp]) {
                    continue;
                }
                this.recursiveClean(subp, val[k]);
            }
        };
        RDb3Root.prototype.subscribeQuery = function (query) {
            this.queries[query.id] = query;
            this.subscriptions['/q' + query.id] = query;
        };
        RDb3Root.prototype.unsubscribeQuery = function (id) {
            this.sendUnsubscribeQuery(id);
            delete this.queries[id];
            delete this.subscriptions['/q' + id];
            delete this.data['q' + id];
        };
        RDb3Root.prototype.getValue = function (url) {
            var ret = findChain(url, this.data, true, false);
            return ret.pop();
        };
        RDb3Root.prototype.handleChange = function (path, val, prog) {
            // Normalize the path to "/" by wrapping the val
            var nv = val;
            var sp = splitUrl(path);
            sp.splice(0, 1);
            while (sp.length) {
                var nnv = {};
                nnv[sp.pop()] = nv;
                markIncomplete(nnv);
                nv = nnv;
            }
            this.recurseApplyBroadcast(nv, this.data, null, '', prog);
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
        };
        RDb3Root.prototype.handleQueryChange = function (id, path, val, prog) {
            var def = this.queries[id];
            if (!def) {
                // TODO stale query, send unsubscribe again?
                return;
            }
            var subp = path.substr(def.path.length);
            var nv = val;
            var sp = splitUrl(subp);
            sp.splice(0, 1);
            while (sp.length) {
                var nnv = {};
                nnv[sp.pop()] = nv;
                markIncomplete(nnv);
                nv = nnv;
            }
            nv.$l = !def.done;
            if (!this.data['q' + id])
                this.data['q' + id] = {};
            nv['$sorter'] = this.data['q' + id]['$sorter'] = def.makeSorter();
            this.recurseApplyBroadcast(nv, this.data['q' + id], this.data, '/q' + id, prog, def.path);
            if (def.limit) {
                var acdata = this.data['q' + id];
                var ks = getKeysOrdered(acdata);
                if (ks.length > def.limit) {
                    var torem = {};
                    while (ks.length > def.limit) {
                        var k = def.limitLast ? ks.shift() : ks.pop();
                        torem[k] = null;
                    }
                    markIncomplete(torem);
                    // TODO probably here the version should not be prog, given that the deletion are based on the current situation
                    this.recurseApplyBroadcast(torem, this.data['q' + id], this.data, '/q' + id, prog, def.path);
                }
            }
        };
        RDb3Root.prototype.recurseApplyBroadcast = function (newval, acval, parentval, path, version, queryPath) {
            var leaf = Utils.leafPath(path);
            if (newval !== null && typeof (newval) === 'object') {
                var changed = false;
                // Change from native value to object
                if (acval === exports.KNOWN_NULL || !acval || typeof (acval) !== 'object') {
                    changed = true;
                    acval = {};
                    if (isIncomplete(newval)) {
                        markIncomplete(acval);
                    }
                    parentval[leaf] = acval;
                }
                var acversions = getVersions(acval);
                if (!isIncomplete(newval) && isIncomplete(acval)) {
                    markComplete(acval);
                    changed = true;
                }
                // Look children of the new value
                var nks = getKeysOrdered(newval);
                for (var nki = 0; nki < nks.length; nki++) {
                    var k = nks[nki];
                    if (k.charAt(0) == '$')
                        continue;
                    var newc = newval[k];
                    var pre = acval[k];
                    var prever = acversions[k];
                    dbgRoot("%s comparing prever %s->%s : %s->%s", path + '/' + k, prever, version, pre, newc);
                    if (prever && prever > version)
                        continue;
                    if (!isIncomplete(newc)) {
                        acversions[k] = version;
                    }
                    if (newc === null) {
                        // Explicit delete
                        var presnap = new RDb3Snap(pre, this, (queryPath || path) + '/' + k);
                        if (this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k, version)) {
                            this.broadcastChildRemoved(path, k, presnap, queryPath);
                            // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                            //this.broadcastChildMoved(path, k, acval[k]);
                            // If we are in a query, really remove the child, no need for KNOWN_NULL
                            if (queryPath)
                                delete acval[k];
                            changed = true;
                        }
                    }
                    else if (pre === exports.KNOWN_NULL || typeof (pre) === 'undefined') {
                        // Child added
                        pre = {};
                        if (isIncomplete(newc)) {
                            markIncomplete(pre);
                        }
                        acval[k] = pre;
                        if (this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k, version)) {
                            changed = true;
                            this.broadcastChildAdded(path, k, acval[k], queryPath, findPreviousKey(acval, k));
                        }
                        else {
                            delete acval[k];
                        }
                    }
                    else {
                        // Maybe child changed
                        var prepre = findPreviousKey(acval, k);
                        if (this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k, version)) {
                            changed = true;
                            // TODO consider sorting and previous key
                            var acpre = findPreviousKey(acval, k);
                            this.broadcastChildChanged(path, k, acval[k], queryPath, acpre);
                            if (prepre != acpre) {
                                this.broadcastChildMoved(path, k, acval[k], queryPath, acpre);
                            }
                        }
                    }
                }
                if (!isIncomplete(newval)) {
                    // If newc is not incomplete, delete all the other children
                    for (var k in acval) {
                        if (k.charAt(0) == '$')
                            continue;
                        if (newval[k] === null || typeof (newval[k]) === 'undefined') {
                            var prever = acversions[k];
                            if (prever && prever > version)
                                continue;
                            var pre = acval[k];
                            acversions[k] = version;
                            var presnap = new RDb3Snap(pre, this, (queryPath || path) + '/' + k);
                            if (this.recurseApplyBroadcast(null, pre, acval, path + '/' + k, version)) {
                                this.broadcastChildRemoved(path, k, presnap, queryPath);
                                // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                                //this.broadcastChildMoved(path, k, acval[k]);
                                changed = true;
                            }
                        }
                    }
                }
                if ((changed && !newval.$l && !isIncomplete(acval)) || newval.$d) {
                    this.broadcastValue(path, acval, queryPath);
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
            }
            else {
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
                    }
                    else {
                        if (parentval[leaf] != exports.KNOWN_NULL) {
                            // keep "known missings", to avoid broadcasting this event over and over if it happens
                            parentval[leaf] = exports.KNOWN_NULL;
                            this.broadcastValue(path, exports.KNOWN_NULL, queryPath);
                            return !!acval;
                        }
                    }
                }
                else if (parentval[leaf] != newval) {
                    parentval[leaf] = newval;
                    this.broadcastValue(path, newval, queryPath);
                    return true;
                }
                return false;
            }
        };
        RDb3Root.prototype.broadcastValue = function (path, val, queryPath) {
            var _this = this;
            this.broadcast(path, 'value', function () { return val instanceof RDb3Snap ? val : new RDb3Snap(val, _this, queryPath || path); });
        };
        RDb3Root.prototype.broadcastChildAdded = function (path, child, val, queryPath, prevChildName) {
            var _this = this;
            this.broadcast(path, 'child_added', function () { return val instanceof RDb3Snap ? val : new RDb3Snap(val, _this, (queryPath || path) + '/' + child); }, prevChildName);
        };
        RDb3Root.prototype.broadcastChildChanged = function (path, child, val, queryPath, prevChildName) {
            var _this = this;
            this.broadcast(path, 'child_changed', function () { return val instanceof RDb3Snap ? val : new RDb3Snap(val, _this, (queryPath || path) + '/' + child); }, prevChildName);
        };
        RDb3Root.prototype.broadcastChildMoved = function (path, child, val, queryPath, prevChildName) {
            var _this = this;
            this.broadcast(path, 'child_moved', function () { return val instanceof RDb3Snap ? val : new RDb3Snap(val, _this, (queryPath || path) + '/' + child); }, prevChildName);
        };
        RDb3Root.prototype.broadcastChildRemoved = function (path, child, val, queryPath) {
            var _this = this;
            this.broadcast(path, 'child_removed', function () { return val instanceof RDb3Snap ? val : new RDb3Snap(val, _this, (queryPath || path) + '/' + child); });
        };
        RDb3Root.prototype.broadcast = function (path, type, snapProvider, prevChildName) {
            var sub = this.subscriptions[path];
            if (!sub)
                return;
            var handlers = sub.findByType(type);
            if (handlers.length == 0)
                return;
            var snap = snapProvider();
            dbgEvt('Send event %s %s:%o to %s handlers', path, type, snap['data'], handlers.length);
            for (var i = 0; i < handlers.length; i++) {
                dbgEvt('%s sent event %s %s', handlers[i]._intid, path, type);
                handlers[i].callback(snap, prevChildName);
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
        catch (e) { }
    }
    var Subscription = (function () {
        function Subscription(root, path) {
            this.root = root;
            this.path = path;
            this.cbs = [];
            this.sentSubscribe = false;
            this.needSubscribe = false;
        }
        Subscription.prototype.add = function (cb) {
            dbgEvt("Adding handler %s from %s", cb._intid, this.path);
            if (this.cbs.length == 0)
                this.subscribe();
            this.cbs.push(cb);
        };
        Subscription.prototype.remove = function (cb) {
            this.cbs = this.cbs.filter(function (ocb) { return ocb !== cb; });
            dbgEvt("Removed handler %s from %s", cb._intid, this.path);
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
        Subscription.prototype.findByType = function (evtype) {
            return this.cbs.filter(function (ocb) { return ocb.eventType == evtype; });
        };
        Subscription.prototype.getCurrentValue = function () {
            return this.root.getValue(this.path);
        };
        return Subscription;
    }());
    exports.Subscription = Subscription;
    var Handler = (function () {
        function Handler(callback, context, tree) {
            this.callback = callback;
            this.context = context;
            this.tree = tree;
            this._intid = 'h' + (prog++);
            this.hook();
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
        return Handler;
    }());
    exports.Handler = Handler;
    var ValueCbHandler = (function (_super) {
        __extends(ValueCbHandler, _super);
        function ValueCbHandler() {
            _super.apply(this, arguments);
        }
        ValueCbHandler.prototype.init = function () {
            this.eventType = 'value';
            var acval = this.getValue();
            if (acval !== null && typeof (acval) !== 'undefined' && !isIncomplete(acval)) {
                dbgEvt('%s Send initial event %s value:%o', this._intid, this.tree.url, acval);
                this.callback(new RDb3Snap(acval, this.tree.root, this.tree.url));
            }
        };
        return ValueCbHandler;
    }(Handler));
    var ChildAddedCbHandler = (function (_super) {
        __extends(ChildAddedCbHandler, _super);
        function ChildAddedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildAddedCbHandler.prototype.init = function () {
            var _this = this;
            this.eventType = 'child_added';
            var acv = this.getValue();
            var mysnap = new RDb3Snap(acv, this.tree.root, this.tree.url);
            var prek = null;
            mysnap.forEach(function (cs) {
                dbgEvt('%s Send initial event %s child_added:%o', _this._intid, cs['url'], cs['data']);
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
        ChildRemovedCbHandler.prototype.init = function () {
            this.eventType = 'child_removed';
            // This event never triggers on init
        };
        return ChildRemovedCbHandler;
    }(Handler));
    var ChildMovedCbHandler = (function (_super) {
        __extends(ChildMovedCbHandler, _super);
        function ChildMovedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildMovedCbHandler.prototype.init = function () {
            this.eventType = 'child_moved';
            // This event never triggers on init
        };
        return ChildMovedCbHandler;
    }(Handler));
    var ChildChangedCbHandler = (function (_super) {
        __extends(ChildChangedCbHandler, _super);
        function ChildChangedCbHandler() {
            _super.apply(this, arguments);
        }
        ChildChangedCbHandler.prototype.init = function () {
            this.eventType = 'child_changed';
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
        function RDb3Snap(data, root, url, reclone) {
            if (reclone === void 0) { reclone = true; }
            this.data = data;
            this.root = root;
            this.url = url;
            if (data === exports.KNOWN_NULL) {
                this.data = null;
            }
            else if (data != null && typeof (data) !== undefined && reclone) {
                var str = JSON.stringify(data);
                if (str === undefined || str === 'undefined') {
                    this.data = undefined;
                }
                else if (str === null || str === 'null') {
                    this.data = null;
                }
                else {
                    this.data = JSON.parse(str);
                }
                if (data['$sorter'])
                    this.data['$sorter'] = data['$sorter'];
            }
            else {
                this.data = data;
            }
        }
        RDb3Snap.prototype.exists = function () {
            return typeof (this.data) !== 'undefined' && this.data !== null;
        };
        RDb3Snap.prototype.val = function () {
            if (!this.exists())
                return null;
            return JSON.parse(JSON.stringify(this.data));
        };
        RDb3Snap.prototype.child = function (childPath) {
            var subs = findChain(childPath, this.data, true, false);
            return new RDb3Snap(subs.pop(), this.root, this.url + Utils.normalizePath(childPath), false);
        };
        RDb3Snap.prototype.forEach = function (childAction) {
            if (!this.exists())
                return;
            var ks = getKeysOrdered(this.data);
            for (var i = 0; i < ks.length; i++) {
                if (childAction(this.child(ks[i])))
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
    function getKeysOrdered(obj, fn) {
        if (!obj)
            return [];
        fn = fn || obj['$sorter'];
        var sortFn = null;
        if (fn) {
            sortFn = function (a, b) {
                return fn(obj[a], obj[b]);
            };
        }
        var ks = Object.getOwnPropertyNames(obj);
        var ret = [];
        for (var i = 0; i < ks.length; i++) {
            if (ks[i].charAt(0) == '$')
                continue;
            ret.push(ks[i]);
        }
        ret = ret.sort(sortFn);
        return ret;
    }
    function findPreviousKey(obj, k) {
        var ks = getKeysOrdered(obj);
        var i = ks.indexOf(k);
        if (i < 1)
            return null;
        return ks[i - 1];
    }
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
    function markIncomplete(obj) {
        if (obj && typeof (obj) === 'object' && !obj['$i']) {
            Object.defineProperty(obj, '$i', { enumerable: false, configurable: true, value: true });
        }
    }
    function markComplete(obj) {
        delete obj.$i;
        //Object.defineProperty(obj, '$i', {enumerable:false, value:false});
    }
    function isIncomplete(obj) {
        return obj && typeof (obj) === 'object' && !!obj['$i'];
    }
    function getVersions(obj) {
        var ret = obj['$v'];
        if (!ret) {
            Object.defineProperty(obj, '$v', { enumerable: false, configurable: true, value: {} });
            ret = obj['$v'];
        }
        return ret;
    }
    /*
    export var KNOWN_NULL = {};
    Object.defineProperty(KNOWN_NULL, 'toJSON', {enumerable:true, configurable:false, set:(v)=>{console.trace()}, get:()=>()=><any>undefined}); //, value:()=><any>undefined});
    Object.defineProperty(KNOWN_NULL, '$i', {enumerable:true, configurable:false, set:(v)=>{console.trace()}, get:()=>false}); // writable:false, value:false});
    */
    exports.KNOWN_NULL = {};
    Object.defineProperty(exports.KNOWN_NULL, 'toJSON', { enumerable: true, configurable: false, writable: false, value: function () { return undefined; } });
    Object.defineProperty(exports.KNOWN_NULL, '$i', { enumerable: true, configurable: false, writable: false, value: false });
    /*
    export var KNOWN_NULL = {
        toJSON: ()=><any>undefined,
        $i: false
    };
    */
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
            dbgTree('Hooking %s to %s, before it has %s hooks', eventType, this.url, this.cbs.length);
            var handler = new ctor(callback, context, this);
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
            dbgTree('Unhooked %s from %s, before it had %s, now has %s hooks', eventType, this.url, prelen, this.cbs.length);
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
            this.root.handleChange(this.url, value, prog);
            this.root.send('s', this.url, value, prog, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        onComplete(new Error(ack));
                    }
                }
            });
        };
        /**
        * Writes the enumerated children to this DbTree location.
        */
        RDb3Tree.prototype.update = function (value, onComplete) {
            // Keep this data live, otherwise it could be deleted accidentally and/or overwritten with an older version
            //this.root.subscribe(this.url);
            var prog = this.root.nextProg();
            for (var k in value) {
                this.root.handleChange(this.url + '/' + k, value[k], prog);
            }
            this.root.send('m', this.url, value, prog, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        onComplete(new Error(ack));
                    }
                }
            });
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
    var progQId = 1;
    var QuerySubscription = (function (_super) {
        __extends(QuerySubscription, _super);
        function QuerySubscription(oth) {
            _super.call(this, oth.root, oth.path);
            this.id = (progQId++) + 'a';
            this.compareField = null;
            this.limit = null;
            this.limitLast = false;
            this.done = false;
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
            return this.root.getValue('/q' + this.id);
        };
        QuerySubscription.prototype.makeSorter = function () {
            var _this = this;
            if (!this.compareField)
                return null;
            return function (a, b) {
                var va = a[_this.compareField];
                var vb = b[_this.compareField];
                if (va > vb)
                    return 1;
                if (vb > va)
                    return -1;
                return 0;
            };
        };
        return QuerySubscription;
    }(Subscription));
    exports.QuerySubscription = QuerySubscription;
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
});

//# sourceMappingURL=Client.js.map
