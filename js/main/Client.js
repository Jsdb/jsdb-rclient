/**
 * TSDB remote client 20160902_125625_master_1.0.0_d771ec4
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
        define(["require", "exports"], factory);    } else {        var glb = typeof window !== 'undefined' ? window : global;        glb['TsdbRClient'] = factory(null, {});    }

})(function (require, exports) {
    "use strict";
    var RDb3Root = (function () {
        function RDb3Root(sock, baseUrl) {
            var _this = this;
            this.sock = sock;
            this.baseUrl = baseUrl;
            this.subscriptions = {};
            this.data = {};
            this.queries = {};
            this.doneProm = null;
            if (sock) {
                sock.on('v', function (msg) { return _this.receivedValue(msg); });
                sock.on('qd', function (msg) { return _this.receivedQueryDone(msg); });
                sock.on('qx', function (msg) { return _this.receivedQueryExit(msg); });
            }
        }
        RDb3Root.prototype.getUrl = function (url) {
            return new RDb3Tree(this, this.makeRelative(url));
        };
        RDb3Root.prototype.makeRelative = function (url) {
            if (url.indexOf(this.baseUrl) != 0)
                return url;
            return "/" + url.substr(this.baseUrl.length);
        };
        RDb3Root.prototype.makeAbsolute = function (url) {
            return this.baseUrl + this.makeRelative(url);
        };
        RDb3Root.prototype.isReady = function () {
            return true;
        };
        RDb3Root.prototype.whenReady = function () {
            var _this = this;
            if (this.doneProm)
                return this.doneProm;
            if (this.sock) {
                return new Promise(function (res, err) {
                    var to = setTimeout(function () { return err(new Error('Timeout')); }, 30000);
                    _this.sock.on('aa', function () {
                        clearTimeout(to);
                        res();
                    });
                });
            }
            else {
                return Promise.resolve();
            }
        };
        RDb3Root.prototype.receivedValue = function (msg) {
            this.handleChange(msg.p, msg.v);
            if (msg.q) {
                var val = msg.v;
                val.$l = true;
                this.handleQueryChange(msg.q, msg.p, val);
            }
        };
        RDb3Root.prototype.receivedQueryDone = function (msg) {
            var qdef = this.queries[msg.q];
            this.handleQueryChange(msg.q, qdef.path, { $i: true });
        };
        RDb3Root.prototype.receivedQueryExit = function (msg) {
            var qdef = this.queries[msg.q];
            this.handleQueryChange(msg.q, msg.p, null);
        };
        RDb3Root.prototype.send = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i - 0] = arguments[_i];
            }
            if (this.sock) {
                this.sock.emit.apply(this.sock, args);
            }
        };
        RDb3Root.prototype.sendSubscribe = function (path) {
            this.send('sp', path);
        };
        RDb3Root.prototype.sendUnsubscribe = function (path) {
            this.send('up', path);
        };
        RDb3Root.prototype.sendSubscribeQuery = function (def) {
            this.send('sq', def);
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
            this.sendUnsubscribe(path);
            delete this.subscriptions[path];
            var ch = findChain(Utils.parentPath(path), this.data);
            var leaf = Utils.leafPath(path);
            var lst = ch.pop();
            delete lst[leaf];
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
        RDb3Root.prototype.handleChange = function (path, val) {
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
            this.recurseApplyBroadcast(nv, this.data, null, '');
        };
        RDb3Root.prototype.handleQueryChange = function (id, path, val) {
            var def = this.queries[id];
            if (!def) {
                // TODO stale query, unsubscribe?
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
            if (!this.data['q' + id])
                this.data['q' + id] = {};
            nv['$sorter'] = this.data['q' + id]['$sorter'] = def.makeSorter();
            this.recurseApplyBroadcast(nv, this.data['q' + id], this.data, '/q' + id, def.path);
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
                    this.recurseApplyBroadcast(torem, this.data['q' + id], this.data, '/q' + id, def.path);
                }
            }
        };
        RDb3Root.prototype.recurseApplyBroadcast = function (newval, acval, parentval, path, queryPath) {
            var leaf = Utils.leafPath(path);
            if (newval !== null && typeof (newval) === 'object') {
                var changed = false;
                // Change from native value to object
                if (!acval || typeof (acval) !== 'object') {
                    changed = true;
                    acval = {};
                    parentval[leaf] = acval;
                }
                // Look children of the new value
                var nks = getKeysOrdered(newval);
                for (var nki = 0; nki < nks.length; nki++) {
                    var k = nks[nki];
                    if (k.charAt(0) == '$')
                        continue;
                    var newc = newval[k];
                    var pre = acval[k];
                    if (newc === null) {
                        // Explicit delete
                        var presnap = new RDb3Snap(pre, this, (queryPath || path) + '/' + k);
                        if (this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k)) {
                            this.broadcastChildRemoved(path, k, presnap, queryPath);
                            // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                            //this.broadcastChildMoved(path, k, acval[k]);
                            changed = true;
                        }
                    }
                    else if (typeof (pre) === 'undefined') {
                        // Child added
                        pre = {};
                        acval[k] = pre;
                        changed = true;
                        this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k);
                        this.broadcastChildAdded(path, k, acval[k], queryPath, findPreviousKey(acval, k));
                    }
                    else {
                        // Maybe child changed
                        var prepre = findPreviousKey(acval, k);
                        if (this.recurseApplyBroadcast(newc, pre, acval, path + '/' + k)) {
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
                        if (newval[k] === null || typeof (newval[k]) === 'undefined') {
                            var pre = acval[k];
                            var presnap = new RDb3Snap(pre, this, (queryPath || path) + '/' + k);
                            if (this.recurseApplyBroadcast(null, pre, acval, path + '/' + k)) {
                                this.broadcastChildRemoved(path, k, presnap, queryPath);
                                // TODO consider sorting and previous key, removing an element makes the next one to move "up" in the list
                                //this.broadcastChildMoved(path, k, acval[k]);
                                changed = true;
                            }
                        }
                    }
                }
                if ((changed && !newval.$l) || newval.$d) {
                    this.broadcastValue(path, acval, queryPath);
                }
                return changed;
            }
            else {
                if (parentval[leaf] != newval) {
                    if (newval === null) {
                        delete parentval[leaf];
                    }
                    else {
                        parentval[leaf] = newval;
                    }
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
            for (var i = 0; i < handlers.length; i++) {
                handlers[i].callback(snap, prevChildName);
            }
        };
        RDb3Root.create = function (conf) {
            return new RDb3Root(conf.socket, conf.baseUrl);
        };
        RDb3Root.VERSION = '20160902_125625_master_1.0.0_d771ec4';
        return RDb3Root;
    }());
    exports.RDb3Root = RDb3Root;
    var glb = typeof window !== 'undefined' ? window : global;
    if (glb || typeof (require) !== 'undefined') {
        try {
            var TsdbImpl = glb['Tsdb'] || require('./Tsdb');
            TsdbImpl.Spi.registry['rclient'] = RDb3Root.create;
        }
        catch (e) { }
    }
    var Subscription = (function () {
        function Subscription(root, path) {
            this.root = root;
            this.path = path;
            this.cbs = [];
        }
        Subscription.prototype.add = function (cb) {
            if (this.cbs.length == 0)
                this.subscribe();
            this.cbs.push(cb);
        };
        Subscription.prototype.remove = function (cb) {
            this.cbs = this.cbs.filter(function (ocb) { return ocb !== cb; });
            if (this.cbs.length == 0)
                this.unsubscribe();
        };
        Subscription.prototype.subscribe = function () {
            this.root.sendSubscribe(this.path);
        };
        Subscription.prototype.unsubscribe = function () {
            this.root.unsubscribe(this.path);
        };
        Subscription.prototype.findByType = function (evtype) {
            return this.cbs.filter(function (ocb) { return ocb.eventType == evtype; });
        };
        return Subscription;
    }());
    exports.Subscription = Subscription;
    var Handler = (function () {
        function Handler(callback, context, tree) {
            this.callback = callback;
            this.context = context;
            this.tree = tree;
            this.hook();
            this.init();
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
            return this.tree.root.getValue(this.tree.url);
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
            if (acval !== null && typeof (acval) !== 'undefined') {
                this.callback(new RDb3Snap(this.getValue(), this.tree.root, this.tree.url));
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
            var mysnap = new RDb3Snap(this.getValue(), this.tree.root, this.tree.url);
            var prek = null;
            mysnap.forEach(function (cs) {
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
            if (data != null && typeof (data) !== undefined && reclone) {
                this.data = JSON.parse(JSON.stringify(data));
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
        Object.defineProperty(obj, '$i', { enumerable: false, value: true });
    }
    function isIncomplete(obj) {
        return !!obj['$i'];
    }
    var RDb3Tree = (function () {
        function RDb3Tree(root, url) {
            this.root = root;
            this.url = url;
            this.cbs = [];
            this.qsub = null;
        }
        RDb3Tree.prototype.getSubscription = function () {
            return this.qsub || this.root.subscribe(this.url);
        };
        RDb3Tree.prototype.on = function (eventType, callback, cancelCallback, context) {
            var ctor = cbHandlers[eventType];
            if (!ctor)
                throw new Error("Cannot find event " + eventType);
            var handler = new ctor(callback, context, this);
            this.cbs.push(handler);
            return callback;
        };
        RDb3Tree.prototype.off = function (eventType, callback, context) {
            this.cbs = this.cbs.filter(function (ach) {
                if (ach.matches(eventType, callback, context)) {
                    ach.decommission();
                    return true;
                }
                return false;
            });
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
            this.root.send('s', this.url, value, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        onComplete(new Error(ack));
                    }
                }
            });
            this.root.handleChange(this.url, value);
        };
        /**
        * Writes the enumerated children to this DbTree location.
        */
        RDb3Tree.prototype.update = function (value, onComplete) {
            this.root.send('m', this.url, value, function (ack) {
                if (onComplete) {
                    if (ack == 'k') {
                        onComplete(null);
                    }
                    else {
                        onComplete(new Error(ack));
                    }
                }
            });
            for (var k in value) {
                this.root.handleChange(this.url + '/' + k, value[k]);
            }
        };
        /**
        * Removes the data at this DbTree location.
        */
        RDb3Tree.prototype.remove = function (onComplete) {
            this.set(null, onComplete);
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
            this.from = null;
            this.to = null;
            this.limit = null;
            this.limitLast = false;
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
            // TODO subscribe to this query
        };
        QuerySubscription.prototype.unsubscribe = function () {
            // TODO unsubscribe this query if handlers are zero
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
});

//# sourceMappingURL=Client.js.map
