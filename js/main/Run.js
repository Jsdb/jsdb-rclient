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
        define(["require", "exports", './Client', 'socket.io-client', 'repl', 'url', 'path', 'util', 'fs'], factory);
    }
})(function (require, exports) {
    "use strict";
    var Client_1 = require('./Client');
    var SocketIO = require('socket.io-client');
    var Repl = require('repl');
    var Url = require('url');
    var Path = require('path');
    var Util = require('util');
    var Fs = require('fs');
    var usage = "\
jsdbrclient \
  -u user\
  -p password\
  -h url \
";
    console.log("JSDB-RCLIENT " + Client_1.VERSION);
    console.log("Type help, use either cmd <arg> <arg> or db.cmd(arg,arg), any other javascript is valid.");
    var args = {};
    var lastArg = '_';
    for (var i = 2; i < process.argv.length; i++) {
        var arg = process.argv[i];
        if (arg.charAt(0) == '-') {
            lastArg = arg.substr(1);
        }
        else {
            var type = typeof (args[lastArg]);
            if (type === 'array') {
                args[lastArg].push(arg);
            }
            else if (type === 'undefined') {
                args[lastArg] = arg;
            }
            else {
                args[lastArg] = [args[lastArg]];
                args[lastArg].push(arg);
            }
        }
    }
    if (!args['h']) {
        console.log(usage);
        process.exit(1);
    }
    var socket = SocketIO.connect(args['h']);
    var firstConnect = false;
    socket.on('connect', function () {
        firstConnect = true;
        wrapOutput('SOCKET Connected');
    });
    socket.on('disconnect', function () {
        wrapOutput('SOCKET Disconnected');
    });
    socket.on('error', function (err) {
        wrapOutput('SOCKET Error', function () { return err; });
    });
    setTimeout(function () {
        if (!firstConnect)
            wrapOutput('! SOCKET Not connected yet !');
    }, 5000);
    var root = new Client_1.RDb3Root(socket, args['h']);
    // TODO default auth
    var progQuery = 1;
    var Db = (function () {
        function Db(path) {
            if (path === void 0) { path = '/'; }
            this.path = path;
            this.listenings = {};
            this.autoResolve = false;
        }
        ;
        Db.prototype.getRef = function (path) {
            path = Path.resolve(this.path, path);
            return root.getUrl(path);
        };
        Db.prototype.describeRef = function (ref) {
            return ref.toString();
        };
        Db.prototype.doResolve = function (val, cb, force) {
            if (force === void 0) { force = false; }
            if (!this.autoResolve && !force) {
                return cb(val);
            }
            var found = [];
            this.recurseFindRef(val, found);
            if (found.length == 0) {
                return cb(val);
            }
            var cnt = found.length;
            var _loop_1 = function() {
                var tuple = found[i];
                var ref = root.getUrl(tuple.url);
                ref.once('value', function (ds) {
                    tuple.par[tuple.name] = ds.val();
                    cnt--;
                    if (cnt == 0)
                        cb(val);
                });
            };
            for (var i = 0; i < found.length; i++) {
                _loop_1();
            }
        };
        Db.prototype.recurseFindRef = function (val, found) {
            if (typeof (val) !== 'object')
                return;
            for (var k in val) {
                var v = val[k];
                if (typeof (v) == 'function')
                    continue;
                if (v['_ref']) {
                    found.push({ par: val, name: k, url: v['_ref'] });
                }
                this.recurseFindRef(v, found);
            }
        };
        Db.prototype.setResolve = function (set) {
            if (typeof (set) != 'boolean') {
                set = set == 1 || set.toLowerCase().charAt(0) == 't';
            }
            this.autoResolve = set;
        };
        Db.prototype.cd = function (path) {
            var _this = this;
            if (path.indexOf('*') != -1) {
                console.log("Looking for " + path);
                path = path.replace(/\*/g, ".*");
                var pathre = new RegExp("^" + path + "$", 'i');
                this.getRef('').once('value', function (ds) {
                    var fnd = null;
                    ds.forEach(function (cs) {
                        if (pathre.test(cs.key()))
                            fnd = cs.key();
                    });
                    if (fnd) {
                        _this.path = Path.resolve(_this.path, fnd);
                        wrapOutput("CD " + _this.path);
                    }
                    else {
                        wrapOutput("CD NO MATCH FOUND FOR " + _this.path + " -> " + pathre);
                    }
                });
            }
            else {
                this.path = Path.resolve(this.path, path);
                console.log(this.path);
            }
        };
        Db.prototype.get = function (path) {
            var _this = this;
            if (path === void 0) { path = this.path; }
            var extra = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                extra[_i - 1] = arguments[_i];
            }
            if (!extra || extra.length == 0) {
                if (path.indexOf(' ') != -1) {
                    var sp = path.split(' ');
                    path = sp[0];
                    extra = sp.slice(1);
                }
                else {
                    extra = [];
                }
            }
            this.getRef(path).once('value', function (ds) {
                _this.lastVal = ds.val();
                var tv = _this.lastVal;
                if (extra.length) {
                    tv = {};
                    for (var i = 0; i < extra.length; i++) {
                        var k = extra[i];
                        tv[k] = _this.lastVal[k];
                    }
                }
                _this.doResolve(tv, function (tv) {
                    wrapOutput('GET ' + _this.describeRef(ds.ref()).toString(), function () { return Util.inspect(tv, false, null, Boolean(process.stdout.isTTY)); });
                });
            });
        };
        Db.prototype.dump = function (path, to) {
            var _this = this;
            if (!to) {
                if (path.indexOf(' ') == -1) {
                    to = path;
                    path = '';
                }
                else {
                    to = path.substr(path.indexOf(' ') + 1);
                    path = path.substr(path.indexOf(' '));
                }
            }
            this.getRef(path).once('value', function (ds) {
                var val = ds.val();
                var fto = to;
                var prog = 1;
                while (Fs.existsSync(fto)) {
                    fto = to + '.' + prog++;
                }
                if (typeof (val) == 'object') {
                    Fs.writeFileSync(fto, JSON.stringify(val, null, 2));
                }
                else {
                    Fs.writeFileSync(fto, val);
                }
                wrapOutput('DUMP ' + _this.describeRef(ds.ref()).toString() + ' -> ' + fto, function () { return Fs.statSync(fto).size + ' bytes written to ' + Fs.realpathSync(fto); });
            });
        };
        Db.prototype.ls = function (path) {
            var _this = this;
            if (path === void 0) { path = this.path; }
            var extra = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                extra[_i - 1] = arguments[_i];
            }
            if (!extra || extra.length == 0) {
                if (path.indexOf(' ') != -1) {
                    var sp = path.split(' ');
                    path = sp[0];
                    extra = sp.slice(1);
                }
                else {
                    extra = [];
                }
            }
            this.getRef(path).once('value', function (ds) {
                wrapOutput('LS ' + _this.describeRef(ds.ref()).toString() + ' ' + extra, function () {
                    ds.forEach(function (cs) {
                        var line = cs.key();
                        for (var i = 0; i < extra.length; i++) {
                            line += '\t| ' + cs.child(extra[i]).val();
                        }
                        console.log(line);
                    });
                    return null;
                });
            });
        };
        Db.prototype.pwd = function () {
            console.log(this.path);
        };
        Db.prototype.registerListening = function (ref, event, cb) {
            var path = root.makeRelative(ref.toString());
            var pre = this.listenings[path];
            if (!pre) {
                pre = [];
                this.listenings[path] = pre;
            }
            pre.push({ event: event, cb: cb });
        };
        Db.prototype.on = function (path) {
            var _this = this;
            if (path === void 0) { path = this.path; }
            var ref = this.getRef(path);
            this.registerListening(ref, 'value', ref.on('value', function (ds) {
                var val = ds.val();
                _this.doResolve(val, function (val) {
                    wrapOutput('ON ' + _this.describeRef(ref), function () { return Util.inspect(ds.val(), false, null, Boolean(process.stdout.isTTY)); });
                });
            }));
        };
        Db.prototype.onChild = function (path) {
            var _this = this;
            if (path === void 0) { path = this.path; }
            var ref = this.getRef(path);
            this.registerListening(ref, 'child_added', ref.on('child_added', function (ds) {
                wrapOutput('CHILD ADDED ' + _this.describeRef(ref) + ' -> ' + ds.key(), function () { return Util.inspect(ds.val(), false, null, Boolean(process.stdout.isTTY)); });
            }));
            this.registerListening(ref, 'child_removed', ref.on('child_removed', function (ds) {
                wrapOutput('CHILD REMOVED ' + _this.describeRef(ref) + ' -> ' + ds.key(), function () { return Util.inspect(ds.val(), false, null, Boolean(process.stdout.isTTY)); });
            }));
        };
        Db.prototype.off = function (path) {
            if (path === void 0) { path = this.path; }
            var ref = this.getRef(path);
            var path = root.makeRelative(ref.toString());
            var pre = this.listenings[path];
            if (!pre)
                return;
            for (var i = 0; i < pre.length; i++) {
                console.log("Off " + pre[i].event);
                ref.off(pre[i].event, pre[i].cb);
            }
            delete this.listenings[path];
        };
        Db.prototype.set = function (path, value) {
            var _this = this;
            if (value !== null && typeof (value) === 'undefined') {
                if (path.indexOf(' ') == -1)
                    throw Error("Specify a value to set, or null");
                value = JSON.parse(path.substr(path.indexOf(' ') + 1));
                path = path.split(' ', 1)[0];
            }
            var ref = this.getRef(path);
            ref.set(value, function (err) {
                if (err) {
                    wrapOutput('SET ' + _this.describeRef(ref), function () { return Util.inspect(err); });
                }
                else {
                    wrapOutput('SET ' + _this.describeRef(ref), function () { return 'OK'; });
                }
            });
        };
        Db.prototype.query = function (path) {
            var ref = this.getRef(path);
            var n = progQuery++;
            var ret = new QueryDb(ref, 'query ' + n);
            repl.context['query' + n] = ret;
            console.log("Created query" + n);
            return ret;
        };
        Db.exp = [
            'cd', 'Change "directory", moves inside a child node',
            'get', 'Loads data and display them, also place them in db.lastVal',
            'dump', 'Loads data and save them to file',
            'ls', 'List children in current path',
            'pwd', 'Print current path',
            'on', 'Listen on value changes and dumps them to screen',
            'onChild', 'Listen on child_added and child_removed and dumps them on screen',
            'set', 'Set a value, overwriting what is there now',
            'off', 'Stops listening, opposite of "on"',
            'query', 'Creates a query, standard query methods (orderByChild, equalTo etc..) and methods (.get .dump etc..) applies to the query object',
            'setResolve', 'Turns on or off auto resolving of references, it\'s handy but can be very slow'];
        return Db;
    }());
    var QueryDb = (function (_super) {
        __extends(QueryDb, _super);
        function QueryDb(ref, expl) {
            _super.call(this);
            this.ref = ref;
            this.expl = expl;
            this.origExpl = expl;
        }
        QueryDb.prototype.getRef = function (path) {
            return this.ref;
        };
        QueryDb.prototype.describeRef = function (ref) {
            return this.origExpl + " " + ref.toString();
        };
        QueryDb.prototype.orderByChild = function (key) {
            this.ref = this.getRef().orderByChild(key);
            this.expl += ' order by "' + key + "'";
            return this;
        };
        QueryDb.prototype.orderByKey = function () {
            this.ref = this.getRef().orderByKey();
            this.expl += ' order by key';
            return this;
        };
        QueryDb.prototype.startAt = function (value, key) {
            this.ref = this.getRef().startAt(value, key);
            this.expl += ' start at "' + value + '"';
            return this;
        };
        QueryDb.prototype.endAt = function (value, key) {
            this.ref = this.getRef().endAt(value, key);
            this.expl += ' end at "' + value + '"';
            return this;
        };
        QueryDb.prototype.equalTo = function (value, key) {
            this.ref = this.getRef().equalTo(value, key);
            this.expl += ' equal to "' + value + '"';
            return this;
        };
        QueryDb.prototype.limitToFirst = function (limit) {
            this.ref = this.getRef().limitToFirst(limit);
            this.expl += ' limit to ' + limit;
            return this;
        };
        QueryDb.prototype.limitToLast = function (limit) {
            this.ref = this.getRef().limitToLast(limit);
            this.expl += ' limit to last ' + limit;
            return this;
        };
        QueryDb.prototype.toString = function () {
            return this.expl;
        };
        QueryDb.prototype.inspect = function (depth) {
            return this.expl;
        };
        return QueryDb;
    }(Db));
    var rconf = {
        prompt: Url.parse(args['h']).hostname + '>',
        useGlobal: false,
        ignoreUndefined: true
    };
    var repl = Repl.start(rconf);
    // Overridden eval, to support straight commands
    var origEval = repl.eval;
    repl.eval = function (code, context, file, cb) {
        var fw = code.split(' ')[0].trim();
        for (var k in repl.commands) {
            if (k == fw) {
                var cmd = repl.commands[k];
                cmd.action.call(repl, code.substr(fw.length).trim());
                return;
            }
        }
        origEval(code, context, file, cb);
    };
    // Utility output wrapper
    function wrapOutput(title, cb) {
        console.log('\n' + title);
        if (cb) {
            console.log('-----------');
            var msg = cb();
            if (msg)
                console.log(msg);
            console.log('-----------');
        }
        repl.displayPrompt();
    }
    // History support
    var file = '.rclient-history';
    try {
        var stat = Fs.statSync(file);
        repl.rli.history = Fs.readFileSync(file, 'utf-8').split('\n').reverse();
        repl.rli.history.shift();
        repl.rli.historyIndex = -1; // will be incremented before pop
    }
    catch (e) { }
    var fd = Fs.openSync(file, 'a'), reval = repl.eval;
    repl.rli.addListener('line', function (code) {
        if (code && code !== '.history') {
            Fs.write(fd, code + '\n');
        }
        else {
            repl.rli.historyIndex++;
            repl.rli.history.pop();
        }
    });
    process.on('exit', function () {
        Fs.closeSync(fd);
    });
    repl.commands['history'] = {
        help: 'Show the history',
        action: function () {
            var out = [];
            repl.rli.history.forEach(function (v, k) {
                out.push(v);
            });
            repl.outputStream.write(out.reverse().join('\n') + '\n');
            repl.displayPrompt();
        }
    };
    // Global setup
    var baseDb = new Db();
    repl.context.db = baseDb;
    var _loop_2 = function() {
        var k = Db.exp[i];
        method = baseDb[k];
        if (typeof (method) !== 'function')
            return "continue";
        repl.context[k] = method.bind(baseDb);
        repl.defineCommand(k, {
            action: function (arg) {
                try {
                    repl.context[k](arg);
                }
                catch (e) {
                    console.log(e);
                }
                repl.displayPrompt();
            },
            help: Db.exp[i + 1]
        });
    };
    var method;
    for (var i = 0; i < Db.exp.length; i += 2) {
        var state_2 = _loop_2();
        if (state_2 === "continue") continue;
    }
    repl.on('exit', function () { return process.exit(); });
});

//# sourceMappingURL=Run.js.map
