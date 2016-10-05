

import {RDb3Root, RDb3Conf, RDb3Tree, VERSION} from './Client';
import * as SocketIO from 'socket.io-client';
import * as Repl from 'repl';
import * as Url from 'url';
import * as Path from 'path';
import * as Util from 'util';
import * as Fs from 'fs';
import * as Vm from 'vm';

var usage = "\
jsdbrclient \
  -u user\
  -p password\
  -h url \
";

console.log("JSDB-RCLIENT " + VERSION);
console.log("Type help, use either cmd <arg> <arg> or db.cmd(arg,arg), any other javascript is valid.");

var args :any = {};
var lastArg = '_';
for (var i = 2; i < process.argv.length; i++) {
    var arg = process.argv[i];
    if (arg.charAt(0) == '-') {
        lastArg = arg.substr(1);
    } else {
        var type = typeof(args[lastArg]);
        if (type === 'array') {
            args[lastArg].push(arg);
        } else if (type === 'undefined') {
            args[lastArg] = arg;
        } else {
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
socket.on('connect', ()=>{
    firstConnect = true;
    wrapOutput('SOCKET Connected');
});
socket.on('disconnect', ()=>{
    wrapOutput('SOCKET Disconnected');
});
socket.on('error', (err:any)=>{
    wrapOutput('SOCKET Error', ()=>err);
});
setTimeout(()=>{
    if (!firstConnect) wrapOutput('! SOCKET Not connected yet !');
}, 5000);


var root = new RDb3Root(socket, args['h']);

// TODO default auth




var progQuery = 1;

class Db {
    constructor(public path :string = '/') {
    };

    listenings :{[index:string]:{event:string,cb:Function}[]} = {};

    lastVal :any;
    autoResolve = false;

    protected getRef(path :string) :RDb3Tree {
        path = Path.resolve(this.path, path);
        return root.getUrl(path);
    }

    protected describeRef(ref :RDb3Tree) {
        return ref.toString();
    }

    protected doResolve(val :any, cb :(val :any)=>any, force = false) {
        if (!this.autoResolve && !force) {
            return cb(val);
        }
        var found :{par:any,name:string,url:string}[] = [];
        this.recurseFindRef(val, found);
        if (found.length == 0) {
            return cb(val);
        }
        var cnt = found.length;
        for (var i = 0; i < found.length; i++) {
            let tuple = found[i];
            let ref = root.getUrl(tuple.url);
            ref.once('value', (ds)=>{
                tuple.par[tuple.name] = ds.val();
                cnt--;
                if (cnt == 0) cb(val);
            });
        }
    }

    private recurseFindRef(val :any, found :{par:any,name:string,url:string}[]) {
        if (typeof(val) !== 'object') return;
        for (var k in val) {
            var v = val[k];
            if (typeof(v) == 'function') continue;
            if (v['_ref']) {
                found.push({par:val,name:k,url:v['_ref']});
            }
            this.recurseFindRef(v, found);
        }
    }

    setResolve(set :any) {
        if (typeof(set) != 'boolean') {
            set = set == 1 || set.toLowerCase().charAt(0) == 't';
        }
        this.autoResolve = set;
    }

    cd(path :string) :void {
        if (path.indexOf('*') != -1) {
            console.log("Looking for " + path);
            path = path.replace(/\*/g,".*");
            var pathre = new RegExp("^" + path + "$",'i');
            this.getRef('').once('value', (ds)=>{
                var fnd :string = null;
                ds.forEach((cs)=>{
                    if (pathre.test(cs.key())) fnd = cs.key();
                });
                if (fnd) {
                    this.path = Path.resolve(this.path, fnd);
                    wrapOutput("CD " + this.path);
                } else {
                    wrapOutput("CD NO MATCH FOUND FOR " + this.path + " -> " + pathre);
                }
            });
        } else {
            this.path = Path.resolve(this.path, path);
            console.log(this.path);
        }
    }

    get(path :string = this.path, ...extra :string[]) :void {
        if (!extra || extra.length == 0) {
            if (path.indexOf(' ') != -1) {
                var sp = path.split(' ');
                path = sp[0];
                extra = sp.slice(1);
            } else {
                extra = [];
            }
        }
        this.getRef(path).once('value', (ds)=>{
            this.lastVal = ds.val();
            var tv = this.lastVal;
            if (extra.length) {
                tv = {};
                for (var i = 0; i < extra.length; i++) {
                    var k = extra[i];
                    tv[k] = this.lastVal[k];
                }
            }
            this.doResolve(tv, (tv :any)=>{
                wrapOutput('GET ' + this.describeRef(ds.ref()).toString(), ()=>Util.inspect(tv, false, null, Boolean((<any>process.stdout).isTTY)));
            });
        });
    }

    export(path :string, to? :string) {
        if (!to) {
            if (path.indexOf(' ') == -1) {
                to = path;
                path = '';
            } else {
                to = path.substr(path.indexOf(' ') + 1);
                path = path.substr(0,path.indexOf(' '));
            }
        }
        this.getRef(path).once('value', (ds)=>{
            var val = ds.val();
            var fto = to;
            var prog = 1;
            while (Fs.existsSync(fto)) {
                fto = to + '.' + prog++; 
            }
            if (typeof(val) == 'object') {
                Fs.writeFileSync(fto, JSON.stringify(val,null,2));
            } else {
                Fs.writeFileSync(fto, val);
            }
            wrapOutput('DUMP ' + this.describeRef(ds.ref()).toString() + ' -> ' + fto, ()=>Fs.statSync(fto).size + ' bytes written to ' + Fs.realpathSync(fto));
        });
    }

    import(to :string, path? :string) {
        if (!path) {
            if (to.indexOf(' ') == -1) {
                path = '';
            } else {
                path = to.substr(to.indexOf(' ') + 1);
                to = to.substr(0,to.indexOf(' '));
            }
        }
        var fto = to.trim();
        if (!Fs.existsSync(fto)) {
            throw new Error('Cannot find file "' + fto + '"'); 
        }
        var content = Fs.readFileSync(fto,"utf8");
        var jsonContent = JSON.parse(content);
        var ref = this.getRef(path);
        ref.set(jsonContent, (err)=>{
            if (err) {
                wrapOutput('LOAD ' + fto + ' -> ' + this.describeRef(ref).toString(), ()=>err);
            } else {
                wrapOutput('LOAD ' + fto + ' -> ' + this.describeRef(ref).toString(), ()=>Fs.statSync(fto).size + ' bytes loaded');
            }
        });
    }

    importText(to :string, path? :string) {
        if (!path) {
            if (to.indexOf(' ') == -1) {
                path = '';
            } else {
                path = to.substr(to.indexOf(' ') + 1);
                to = to.substr(0,to.indexOf(' '));
            }
        }
        var fto = to.trim();
        if (!Fs.existsSync(fto)) {
            throw new Error('Cannot find file "' + fto + '"'); 
        }
        var content = Fs.readFileSync(fto,"utf8");
        var ref = this.getRef(path);
        ref.set(content, (err)=>{
            if (err) {
                wrapOutput('LOAD ' + fto + ' -> ' + this.describeRef(ref).toString(), ()=>err);
            } else {
                wrapOutput('LOAD ' + fto + ' -> ' + this.describeRef(ref).toString(), ()=>Fs.statSync(fto).size + ' bytes loaded as text');
            }
        });
    }

    ls(path :string = this.path, ...extra :string[]) :void {
        if (!extra || extra.length == 0) {
            if (path.indexOf(' ') != -1) {
                var sp = path.split(' ');
                path = sp[0];
                extra = sp.slice(1);
            } else {
                extra = [];
            }
        }
        this.getRef(path).once('value', (ds)=>{
            this.doResolve(ds.val(), (val)=>{
                wrapOutput('LS ' + this.describeRef(ds.ref()).toString() + ' ' + extra, ()=>{
                    for (var line in val) {
                        for (var i = 0; i < extra.length; i++) {
                            line += '\t| ' + Util.inspect(val[line][extra[i]], {depth:1});
                        }
                        console.log(line);
                    }
                    return null;
                });
            });
        });
    }

    pwd() :void {
        console.log(this.path);
    }

    registerListening(ref :RDb3Tree, event :string, cb :Function) {
        var path = root.makeRelative(ref.toString());
        var pre = this.listenings[path];
        if (!pre) {
            pre = [];
            this.listenings[path] = pre;
        }
        pre.push({event:event,cb:cb});
    }

    on(path :string = this.path) :void {
        var ref = this.getRef(path);
        this.registerListening(ref, 'value', ref.on('value', (ds)=>{
            var val = ds.val();
            this.doResolve(val, (val)=>{
                wrapOutput('ON ' + this.describeRef(ref), ()=>Util.inspect(ds.val(), false, null, Boolean((<any>process.stdout).isTTY)));
            });
        }));
    }

    onChild(path :string = this.path) :void {
        var ref = this.getRef(path);
        this.registerListening(ref, 'child_added', ref.on('child_added', (ds)=>{
            wrapOutput('CHILD ADDED ' + this.describeRef(ref) + ' -> ' + ds.key(), ()=>Util.inspect(ds.val(), false, null, Boolean((<any>process.stdout).isTTY)));
        }));
        this.registerListening(ref, 'child_removed', ref.on('child_removed', (ds)=>{
            wrapOutput('CHILD REMOVED ' + this.describeRef(ref) + ' -> ' + ds.key(), ()=>Util.inspect(ds.val(), false, null, Boolean((<any>process.stdout).isTTY)));
        }));
    }
    
    off(path :string = this.path) :void {
        var ref = this.getRef(path);
        var path = root.makeRelative(ref.toString());
        var pre = this.listenings[path];
        if (!pre) return;
        for (var i = 0; i < pre.length; i++) {
            console.log("Off " + pre[i].event);
            ref.off(pre[i].event, <any>pre[i].cb);
        }
        delete this.listenings[path];
    }

    set(path :string, value :any) :void {
        if (value !== null && typeof(value) === 'undefined') {
            if (path.indexOf(' ') == -1) throw Error("Specify a value to set, or null");
            value = JSON.parse(path.substr(path.indexOf(' ')+1));
            path = path.split(' ',1)[0];
        }
        var ref = this.getRef(path);
        ref.set(value, (err)=>{
            if (err) {
                wrapOutput('SET ' + this.describeRef(ref),()=>Util.inspect(err));
            } else {
                wrapOutput('SET ' + this.describeRef(ref),()=>'OK');
            }
        });
    }

    delete(path :string) {
        this.set(path, null);
    }

    query(path :string) :QueryDb {
        var ref = this.getRef(path);
        var n = progQuery++;
        var ret = new QueryDb(ref, 'query ' + n);
        repl.context['query' + n] = ret;
        console.log("Created query" + n);
        return ret;
    }

    static exp = [
        'cd','Change "directory", moves inside a child node',
        'get','Loads data and display them, also place them in db.lastVal',
        'export','Save data from DB to a file',
        'import','Load data from file to DB',
        'importText','Load text from file to DB',
        'ls','List children in current path',
        'pwd','Print current path',
        'on','Listen on value changes and dumps them to screen',
        'onChild','Listen on child_added and child_removed and dumps them on screen',
        'set','Set a value, overwriting what is there now',
        'delete','Deletes the current or provided path, equal to set null',
        'off','Stops listening, opposite of "on"',
        'query','Creates a query, standard query methods (orderByChild, equalTo etc..) and methods (.get .dump etc..) applies to the query object',
        'setResolve','Turns on or off auto resolving of references, it\'s handy but can be very slow'];
}

class QueryDb extends Db {

    protected origExpl :string;

    constructor(protected ref :RDb3Tree, protected expl :string) {
        super();
        this.origExpl = expl;
    }

    getRef(path? :string) {
        return this.ref;
    }

    protected describeRef(ref :RDb3Tree) {
        return this.origExpl + " " + ref.toString();
    }

    orderByChild(key: string) :QueryDb {
        this.ref = this.getRef().orderByChild(key);
        this.expl += ' order by "' + key + "'";
        return this;
    }

    orderByKey() :QueryDb {
        this.ref = this.getRef().orderByKey();
        this.expl += ' order by key';
        return this;
    }

    startAt(value: string | number, key?: string): QueryDb {
        this.ref = this.getRef().startAt(value, key);
        this.expl += ' start at "' + value + '"';
        return this;
    }

    endAt(value: string | number, key?: string): QueryDb {
        this.ref = this.getRef().endAt(value, key);
        this.expl += ' end at "' + value + '"';
        return this;
    }


    equalTo(value: string | number, key?: string): QueryDb {
        this.ref = this.getRef().equalTo(value, key);
        this.expl += ' equal to "' + value + '"';
        return this;
    }

    limitToFirst(limit: number): QueryDb {
        this.ref = this.getRef().limitToFirst(limit);
        this.expl += ' limit to ' + limit;
        return this;
    }

    limitToLast(limit: number): QueryDb {
        this.ref = this.getRef().limitToLast(limit);
        this.expl += ' limit to last ' + limit;
        return this;
    }

    toString() {
        return this.expl;
    }

    inspect(depth? :number) {
        return this.expl;
    }

}



var rconf = <Repl.ReplOptions>{
    prompt: Url.parse(args['h']).hostname + '>',
    useGlobal: false,
    ignoreUndefined: true
};


var repl :any = Repl.start(rconf);


// Overridden eval, to support straight commands
var origEval = repl.eval;
repl.eval = (code :string, context :any, file :string, cb :Function) => {
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
function wrapOutput(title :string, cb? :()=>string) {
    console.log('\n' + title);
    if (cb) {
        console.log('-----------');
        var msg = cb();
        if (msg) console.log(msg);
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
} catch (e) { }

var fd = Fs.openSync(file, 'a'), reval = repl.eval;

repl.rli.addListener('line', (code:string) => {
    if (code && code !== '.history') {
        Fs.write(fd, code + '\n');
    } else {
        repl.rli.historyIndex++;
        repl.rli.history.pop();
    }
});

process.on('exit', () => {
    Fs.closeSync(fd);
});

repl.commands['history'] = {
    help: 'Show the history',
    action: function () {
        var out :string[] = [];
        repl.rli.history.forEach((v :string, k :any) => {
            out.push(v);
        });
        repl.outputStream.write(out.reverse().join('\n') + '\n');
        repl.displayPrompt();
    }
};


// Global setup
var baseDb = new Db();
repl.context.db = baseDb;

for (var i = 0; i < Db.exp.length; i+=2) {
    let k = Db.exp[i];
    var method :Function = (<any>baseDb)[k];
    if (typeof(method) !== 'function') continue;
    repl.context[k] = method.bind(baseDb);
    repl.defineCommand(k, {
        action: (arg:string)=>{
            try {
                repl.context[k](arg);
            } catch (e) {
                console.log(e);
            }
            repl.displayPrompt();
        },
        help: Db.exp[i+1]
    });
}
repl.on('exit', ()=>process.exit());





