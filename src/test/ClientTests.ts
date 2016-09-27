import * as Debug from 'debug';
//Debug.enable('tsdb:*');

import * as Benchmark from 'benchmark';

import * as Client from '../main/Client';
import * as SocketIO from 'socket.io';
import * as SocketIOClient from 'socket.io-client';

import {assert, is} from 'tsmatchers';
import {Matcher,matcherOrEquals,later,check} from 'tsmatchers/js/main/tsMatchers';

interface TestDb3Root {
    data: any;
}

var dummyProg = 1;

var root: Client.RDb3Root & TestDb3Root;

describe('RDb3Client >', () => {
    describe('Metadata >', () => {
        it('Should binary-search find stuff', ()=>{
            var md = new Client.Metadata();
            md.sorted = ['1','3','5','7'];
            for (var i = 0; i < md.sorted.length; i++) {
                assert("Find element " + i, md.binaryIndexOf(md.sorted[i]), is.array.equals([true,i]));
            }

            assert("Should not find non present", md.binaryIndexOf('ciao')[0], false);

            assert("Should find insertion point", md.binaryIndexOf('2'), is.array.equals([false,1]));
            assert("Should find insertion point", md.binaryIndexOf('4'), is.array.equals([false,2]));
            assert("Should find insertion point", md.binaryIndexOf('6'), is.array.equals([false,3]));
            assert("Should find insertion point", md.binaryIndexOf('8'), is.array.equals([false,4]));
            assert("Should find insertion point", md.binaryIndexOf('9'), is.array.equals([false,4]));
        });

        it('Should correctly delete elements', ()=>{
            var md = new Client.Metadata();
            md.sorted = ['1','3','5','7'];

            var ret = md.modifySorted(['1'],[false]);
            assert("modified the array",md.sorted,is.array.equals(['3','5','7']));
            assert("returned one element", ret, is.array.withLength(1));
            assert("the returned element is empty", ret[0], is.strictly.object.matching({prev:is.falsey}));
        });

        it('Should correctly add elements', ()=>{
            var md = new Client.Metadata();
            md.sorted = ['1','3','5','7'];

            var ret = md.modifySorted(['2'],[true]);
            assert("modified the array",md.sorted,is.array.equals(['1','2','3','5','7']));
            assert("returned the addition", ret, is.array.withLength(1));
            assert("returned the right values", ret[0], is.object.matching({prev:is.falsey,actual:'1',index:1}));
        });

        it('Should add, remove and reorder elements', ()=>{
            var md = new Client.Metadata();
            md.sorted = ['1','3','5','7'];

            var ret = md.modifySorted(['2','5','7'],[true,false,null]);
            assert("modified the array",md.sorted,is.array.equals(['1','2','3','7']));
            assert("returned the addition", ret, is.array.withLength(3));
            assert("returned the right values for add", ret[0], is.object.matching({prev:is.falsey, actual:'1'}));
            assert("returned the right values for remove", ret[1], is.array.withLength(0));
            assert("returned the right values for moved", ret[2], is.object.matching({prev:'5', actual:'3'}));
        });
    });

    describe('Local data >', () => {

        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });

        describe('Reading >', () => {
            it('Should not find root non existing data', () => {
                assert("Should return undefined", root.getValue('/node'), is.undefined);
                assert("Should not have polluted data", root.data, is.strictly.object.matching({}));
            });
            it('Should find root existing data', () => {
                root.data['node'] = 'ciao';
                assert("Should return a string", root.getValue('/node'), 'ciao');
            });
            it('Should not find sub non existing data', () => {
                assert("Should return undefined", root.getValue('/node/subnode'), is.undefined);
            });
            it('Should not find sub non existing of primitive', () => {
                root.data['node'] = 'ciao';
                assert("Should return undefined", root.getValue('/node/subnode'), is.undefined);
            });
            it('Should not find sub non existing of primitive', () => {
                root.data['node'] = 'ciao';
                assert("Should return undefined", root.getValue('/node/length'), is.undefined);
            });
            it('Should not find sub non existing leaf', () => {
                root.data['node'] = { pippo: 'bah' };
                assert("Should return undefined", root.getValue('/node/subnode'), is.undefined);
            });
            it('Should find leaf existing data', () => {
                root.data['node'] = { subnode: 'ciao' };
                assert("Should return a string", root.getValue('/node/subnode'), 'ciao');
            });
        });

        describe('Writing >', () => {
            it('Should write root primitive', () => {
                root.handleChange('/node', 'ciao', dummyProg++);
                assert("Should return string", root.data['node'], 'ciao');
            });
            it('Should write sub primitive', () => {
                root.handleChange('/node/sub', 'ciao', dummyProg++);
                assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should overwrite sub primitive', () => {
                root.handleChange('/node/sub', 'ciao', dummyProg++);
                root.handleChange('/node/sub', 'pippo', dummyProg++);
                assert("Should return string", root.data['node']['sub'], 'pippo');
            });
            it('Should write sub primitive with alternative url', () => {
                root.handleChange('node/sub/', 'ciao', dummyProg++);
                assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write object', () => {
                root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, dummyProg++);
                console.log(root.data);
                assert("Should return plain object", root.data['node'], is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should merge subs', () => {
                root.handleChange('/node', { sub1: 'ciao' }, dummyProg++);
                root.handleChange('/node/sub2', 'altro', dummyProg++);
                assert("Should return merged object", root.data['node'], is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should overwrite subs', () => {
                root.handleChange('/node/sub2', 'altro', dummyProg++);
                root.handleChange('/node', { sub1: 'ciao' }, dummyProg++);
                assert("Should return merged object", JSON.stringify(root.data['node']['sub2']), is.undefined);
            });

            describe('Versioned >', ()=>{
                it('Should not override leaf with previous version', ()=>{
                    root.handleChange('/node/sub2', 'altro', 2);
                    root.handleChange('/node/sub2', 'ultro', 1);
                    assert("Should be the first version", root.data['node'], is.object.matching({
                        sub2: 'altro'
                    }));
                });

                it('Should not override object with previous version', ()=>{
                    root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, 2);
                    root.handleChange('/node', { sub1: 'aaa', sub2: 'bbb' }, 1);

                    assert("Should be the first version", root.data['node'], is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));

                    root.handleChange('/node/sub2', 'ultro', 1);
                    
                    assert("Should be the first version", root.data['node'], is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));
                });

                it('Should not override from root', ()=>{
                    root.handleChange('/withProps', { wp1: {str:'ciao'}, wp2: 'altro' }, 3);
                    root.handleChange('/withProps/wp1/str', 'pippo', 34);
                    root.handleChange('', {withProps:{ wp1: {str:'ciao'}, wp2: 'altro' }}, 33);

                    assert("Should be the first version", root.data['withProps'], is.object.matching({
                        wp1: {str:'pippo'},
                        wp2: 'altro'
                    }));
                });

                it('Should not override object with previous null', ()=>{
                    root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, 2);
                    root.handleChange('/node/sub3', 'ancora', 3);
                    root.handleChange('/node', { sub1: 'aaa'}, 2);

                    assert("Should ignore missing sub3", root.data['node'], is.object.matching({
                        sub1: 'aaa',
                        sub3: 'ancora'
                    }));

                    root.handleChange('/node/sub3', null, 2);
                    
                    assert("Should ignore explicit nullified sub3", root.data['node'], is.object.matching({
                        sub1: 'aaa',
                        sub3: 'ancora'
                    }));
                });
                

                it('Should override partials with previous version', ()=>{
                    root.handleChange('/node', { sub1: 'aaa', sub2: 'bbb' }, 1);
                    root.handleChange('/node/sub2', 'altro', 4);
                    root.handleChange('/node/sub1', 'ciao', 2);

                    assert("Should be a mix of versions", root.data['node'], is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));

                    root.handleChange('/node', {sub1: 'leaks', sub2: 'doesnot' }, 3);
                    
                    assert("Should be the first version", root.data['node'], is.object.matching({
                        sub1: 'leaks',
                        sub2: 'altro'
                    }));
                });
                
            });
        });
    });


    describe('Higher layer >', () => {

        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });

        describe('Shapshot >', () => {
            it('.exists should work', () => {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                assert('Should return true for string', snap.exists(), true);

                snap = new Client.RDb3Snap(0, root, '/test/node');
                assert('Should return true for zero', snap.exists(), true);

                snap = new Client.RDb3Snap(null, root, '/test/node');
                assert('Should return false for null', snap.exists(), false);

                snap = new Client.RDb3Snap(undefined, root, '/test/node');
                assert('Should return false for undefined', snap.exists(), false);
            });

            it('.key should work', () => {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                assert("Should return last segment", snap.key(), 'node');
            });

            it('.val should return native value', () => {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                assert('Should return string', snap.val(), 'ciao');

                snap = new Client.RDb3Snap(0, root, '/test/node');
                assert('Should return zero', snap.val(), 0);
            });

            it('.val should return object', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                assert('Should return object', snap.val(), is.strictly.object.matching({ sub: { val: 'ciao' }, oth: 1 }));
            });
            // This test has been removed cause cloning each time the value is too slow
            /*
            it('.val return value is unmodifiable', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var val = snap.val();
                val.sub.val = 'pippo';
                var val2 = snap.val();
                assert('Should return object', snap.val(), is.strictly.object.matching({ sub: { val: 'ciao' }, oth: 1 }));
            });
            */

            it('.child should return native direct child', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('oth');
                assert("Should return native child", child.val(), 1);
            });
            it('.child should return object direct child', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('sub');
                assert("Should return native child", child.val(), is.strictly.object.matching({ val: 'ciao' }));
            });
            it('.child should return native grand child', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('sub/val');
                assert("Should return native child", child.val(), 'ciao');
            });
            it('.child should return object grand child', () => {
                var snap = new Client.RDb3Snap({ sub: { val: { inner: 'ciao' } } }, root, '/test/node');
                var child = snap.child('sub/val');
                assert("Should return native child", child.val(), is.strictly.object.matching({ inner: 'ciao' }));
            });

            it('.forEach cycles all children', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var subs: Client.RDb3Snap[] = [];
                snap.forEach((sub) => {
                    subs.push(sub);
                    if (sub.key() == 'sub') {
                        assert("Should return native child", sub.val(), is.strictly.object.matching({ val: 'ciao' }));
                    } else if (sub.key() == 'oth') {
                        assert("Should return native child", sub.val(), 1);
                    } else {
                        assert("Should not have returned this key", sub.key(), '_should not be');
                    }
                });
                assert("Should cycle on two children", subs, is.array.withLength(2));
            });

            it('.forEach should stop on true', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var subs: Client.RDb3Snap[] = [];
                snap.forEach((sub) => {
                    subs.push(sub);
                    return true;
                });
                assert("Should cycle on one child only", subs, is.array.withLength(1));
            });
        });

        describe('Value event >', () => {
            it('Should send a value event and off it', () => {
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                var ctx = "ciao";
                var fn = ref.on('value', (data) => snap = data, null, ctx);
                root.handleChange('/node/data', 'ciao', dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');

                snap = null;
                ref.off('value', fn, ctx);
                root.handleChange('/node/data', 'ciao2', dummyProg++);
                assert("Should not receive another event", snap, is.falsey);
            });

            it('Should off the right event', ()=>{
                var ref = root.getUrl('/node');
                var evts :string[] = [];
                var fn_value = ref.on('value', (data) => evts.push('v'));
                var fn_child_added = ref.on('child_added', (data) => evts.push('ca'));
                var fn_child_removed = ref.on('child_removed', (data) => evts.push('cr'));
                root.handleChange('/node', {a:1}, dummyProg++);
                root.handleChange('/node', {c:3}, dummyProg++);

                assert("Right events in right order", evts, is.array.equals(['ca','v','ca','cr','v']));

                ref.off('value', fn_value);
                evts = [];

                root.handleChange('/node', {d:5}, dummyProg++);

                assert("Right events in right order after off", evts, is.array.equals(['ca','cr']));

                ref.off('child_added', fn_child_added);
                ref.off('child_removed', fn_child_removed);
                evts = [];

                root.handleChange('/node', {e:5}, dummyProg++);

                assert("No more events", evts, is.array.withLength(0));
            });

            it('Should send a value event for already existing data', () => {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                var fn = ref.on('value', (data) => snap = data);

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should not send a value for existing but not loaded data', ()=>{
                root.handleChange('/node/data/sub', 'ciao', dummyProg++);
                
                assert("/node is incomplete", root.getOrCreateMetadata('/node').incomplete, true);
                assert("/node/data is incomplete", root.getOrCreateMetadata('/node/data').incomplete, true);

                var ref = root.getUrl('/node/');
                var snap: Client.RDb3Snap;
                var fn = ref.on('value', (data) => snap = data);

                assert("Not yet received event", snap, is.falsey);

                root.handleChange('/node', {data: {sub:'ciao'}}, dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), is.strictly.object.matching({data: {sub:'ciao'}}));
            });

            it('Should send a value event with once', () => {
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                ref.once('value', (data) => snap = data);
                root.handleChange('/node/data', 'ciao', dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');

                snap = null;
                root.handleChange('/node/data', 'ciao2', dummyProg++);
                assert("Should not receive another event", snap, is.falsey);
            });

            it('Should send a value event for outer change', () => {
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                root.handleChange('/node', { pippo: 'puppo', data: 'ciao' }, dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should send a value event for inner additions', () => {
                root.handleChange('/node', {oth:'pippo'}, dummyProg++);
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                snap = null;

                root.handleChange('/node/data', 'ciao', dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.val(), is.strictly.object.matching({ data: 'ciao', oth: 'pippo' }));
            });

            it('Should send a value event for inner changes', () => {
                var ref = root.getUrl('/node');
                root.handleChange('/node', {'data':'bau'}, dummyProg++);
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                snap = null;

                root.handleChange('/node/data', 'ciao', dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.val(), is.strictly.object.matching({ data: 'ciao' }));
            });

            it('Should correctly handle value events for leafs', ()=>{
                root.handleChange('/node', {}, dummyProg++);
                root.handleChange('/node/a', {}, dummyProg++);
                root.handleChange('/node', {a:{b:{c:'bau'}}}, dummyProg++);

                var ref = root.getUrl('/node/a/b');
                var snap: Client.RDb3Snap = null;
                ref.on('value', (data) => snap = data);

                assert("Received initial event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.val(), is.object.matching({c:'bau'}));

                snap = null;
                root.handleChange('/node/a/b/c', 'ciao', dummyProg++);

                assert("Received second event", snap, is.truthy);
                assert("Second snapshot is existing", snap.exists(), true);
                assert("Recevied second event data", snap.val(), is.object.matching({c:'ciao'}));

                snap = null;
                root.handleChange('/node/a/b/c', null, dummyProg++);

                assert("Received third event", snap, is.truthy);
                assert("Third snapshot is existing", snap.exists(), true);
                assert("Recevied third event data", snap.val(), is.object.matching({c:is.undefined}));

                snap = null;
                root.handleChange('/node/a/b', null, dummyProg++);

                assert("Received fourth event", snap, is.truthy);
                assert("Fourth snapshot is existing", snap.exists(), false);
            });

            it("Should send a value event for mere completion", () => {
                var ref1 = root.getUrl('/node/a/b');
                var snap1: Client.RDb3Snap = null;
                ref1.on('value', (data) => snap1 = data);

                var ref2 = root.getUrl('/node');
                var snap2: Client.RDb3Snap = null;
                ref2.on('value', (data) => snap2 = data);
                
                root.handleChange('/node/a/b', 'ciao', dummyProg++);

                assert("First event received", snap1, is.truthy);
                assert("First dnapshot is existing", snap1.exists(), true);
                assert("First event data is right", snap1.val(), 'ciao');

                root.handleChange('/node', {a:{b:'ciao'}}, dummyProg++);

                assert("Second event received", snap2, is.truthy);
                assert("Second dnapshot is existing", snap2.exists(), true);
                assert("Second event data is right", snap2.val(), is.object.matching({a:{b:'ciao'}}));

                snap1 = snap2 = null;
                root.handleChange('/node/a', {b:'ciao'}, dummyProg++);
                
                assert("First event not received again", snap1, is.falsey);
                assert("Second event not received again", snap2, is.falsey);
            });

            it("Should send a value event from inside an initial value event", () => {
                var ref = root.getUrl('/node');
                root.handleChange('/node', {'data':'bau'}, dummyProg++);

                var cnt = 0;
                
                ref.on('value', (data) =>{
                    cnt++;
                    if (cnt == 1) {
                        root.handleChange('/node', {'data':'bio'}, dummyProg++);
                    }
                });

                assert("sent and received the second event", cnt, 2);
            });

            it('Snapshots are immutable', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('value', (data) => snaps.push(data));
                root.handleChange('/node', {'data1':'bau'}, dummyProg++);
                root.handleChange('/node/data2', 'ciao', dummyProg++);
                root.handleChange('/node/data3', 'miao', dummyProg++);
                root.handleChange('/node/data1', null, dummyProg++);
                root.handleChange('/node/data1', 'pio', dummyProg++);

                assert("Received events", snaps, is.array.withLength(5));
                assert("First snap is only one element", snaps[0].val(), is.strictly.object.matching({data1:is.truthy}));
                assert("Second snap is two element", snaps[1].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy}));
                assert("Third snap is three element", snaps[2].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy,data3:is.truthy}));
                assert("Fourth snap is two element", snaps[3].val(), is.strictly.object.matching({data2:is.truthy,data3:is.truthy}));
                assert("Third snap is three element", snaps[4].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy,data3:is.truthy}));

                var keys :string[] = [];

                snaps[0].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in first snap", keys, is.array.equals(['data1']));

                keys = [];
                snaps[1].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in second snap", keys, is.array.equals(['data1','data2']));

                keys = [];
                snaps[2].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in third snap", keys, is.array.equals(['data1','data2','data3']));

                keys = [];
                snaps[3].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in fourth snap", keys, is.array.equals(['data2','data3']));

                keys = [];
                snaps[4].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in fifth snap", keys, is.array.equals(['data1','data2','data3']));
            });

            it('Snapshots are immutable also with nested objects', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('value', (data) => snaps.push(data));
                root.handleChange('/node', {'data1':{val:'bau'}}, dummyProg++);
                root.handleChange('/node/data2', {val:'ciao'}, dummyProg++);
                root.handleChange('/node/data3', {val:'miao'}, dummyProg++);
                root.handleChange('/node/data1', null, dummyProg++);
                root.handleChange('/node/data1', {val:'pio'}, dummyProg++);

                assert("Received events", snaps, is.array.withLength(5));
                assert("First snap is only one element", snaps[0].val(), is.strictly.object.matching({data1:is.truthy}));
                assert("Second snap is two element", snaps[1].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy}));
                assert("Third snap is three element", snaps[2].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy,data3:is.truthy}));
                assert("Fourth snap is two element", snaps[3].val(), is.strictly.object.matching({data2:is.truthy,data3:is.truthy}));
                assert("Third snap is three element", snaps[4].val(), is.strictly.object.matching({data1:is.truthy,data2:is.truthy,data3:is.truthy}));

                var keys :string[] = [];

                snaps[0].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in first snap", keys, is.array.equals(['data1']));

                keys = [];
                snaps[1].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in second snap", keys, is.array.equals(['data1','data2']));

                keys = [];
                snaps[2].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in third snap", keys, is.array.equals(['data1','data2','data3']));

                keys = [];
                snaps[3].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in fourth snap", keys, is.array.equals(['data2','data3']));

                keys = [];
                snaps[4].forEach((cs)=>{ keys.push(cs.key()); });
                assert("Right keys in fifth snap", keys, is.array.equals(['data1','data2','data3']));
            });
            

        });

        describe('Known missing >', ()=>{
            it('Should send a value event for confirmed null, also on second call', () => {
                root = <any>new Client.RDb3Root(null, 'http://ciao/');

                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                var cb = ref.on('value', (data) => snap = data);
                root.handleChange('/node', null, dummyProg++);
                console.log(root.data);

                assert("Received first event", snap, is.truthy);
                console.log(snap.val());
                assert("First snapshot is non existing", snap.exists(), false);

                snap = null;

                ref.on('value', (data) => snap = data);
                ref.off('value', cb);

                assert("Received second value event", snap, is.truthy);
                assert("Second snapshot is non existing", snap.exists(), false);
            });

            it('Should properly replace a known missing with a new value', () => {
                var ref = root.getUrl('/node');
                root.handleChange('/node/sub1', null, dummyProg++);
                root.handleChange('/node/sub2', null, dummyProg++);
                root.handleChange('/node/sub1', {name:'simone'}, dummyProg++);
                root.handleChange('/node', {'sub2': {name:'simone'}}, dummyProg++);

                console.log(root.getOrCreateMetadata('/node'));

                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                var cb = ref.on('value', (data) => snap = data);
                
                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
            });
        });

        describe.skip('Local cache >', ()=>{
            it('Should not delete children protected by parent', ()=>{
                root.handleChange('/node', {a:1,b:2,c:3}, dummyProg++);
                root.subscribe('/node');
                root.subscribe('/node/a');
                assert("Value should be there", root.getValue('/node/a'), 1);

                root.unsubscribe('/node/a');
                assert("Value should still be there and valid", root.getValue('/node'), is.object.matching({a:1,$i:is.undefined}));

                root.unsubscribe('/node');
                assert("Value should not be there anymore", root.getValue('/node'), is.object.matching({$i:is.truthy}));
            });

            it('Should not delete siblings on the way', ()=>{
                root.handleChange('/node', {a:{val:1},b:{val:2},c:{val:3}}, dummyProg++);
                root.subscribe('/node/a');
                root.unsubscribe('/node/a');
                assert("Value should not be valid anymore", root.getValue('/node/a'), is.object.matching({val:1,$i:true}));
                assert("Sibling should still be there", root.getValue('/node/b'), is.object.matching({val:2,$i:is.undefined}));
            });

            /*
            it('Should clean up parents when setting null on grandchild', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.handleChange('/node', {a:{val:null}}, dummyProg++);
                assert("Data should be emtpy", root.data, is.strictly.object.matching({}));
            });

            it('Should clean up parents when setting null on child', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.handleChange('/node', {a:null}, dummyProg++);
                assert("Data should be emtpy", root.data, is.strictly.object.matching({}));
            });

            it('Should clean up parents when setting nullifying all', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.handleChange('/node', null, dummyProg++);
                assert("Data should be emtpy", root.data, is.strictly.object.matching({}));
            });
            */

            it('Should not clean up, but keep know nulls, if there is subscription', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.subscribe('/node');
                root.handleChange('/node', null, dummyProg++);
                assert("Data should be with known null", root.data, is.strictly.object.matching({node:is.object, $i: true, $v :is.object}));
            });

            /*
            it('Should clean up parents when setting null only', ()=>{
                root.handleChange('/node', null, dummyProg++);
                assert("Data should be emtpy", root.data, is.strictly.object.matching({}));
            });

            it('Should empty data when setting null on root', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.handleChange('', null, dummyProg++);
                assert("Data should be emtpy", root.data, is.strictly.object.matching({}));
            });
            */
        });

        describe('Child diff events >', () => {
            it('Should send one child_added from empty', () => {
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_added', (data) => {
                    snap = data;
                });
                root.handleChange('/node/data', 'ciao', dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.key(), 'data');
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should send multiple child_added from empty', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('child_added', (data) => snaps.push(data));
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);

                assert("Received events", snaps, is.array.withLength(2));
            });

            it('Should not send child_added for existing', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('child_added', (data) => snaps.push(data));
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);

                assert("Received events", snaps, is.array.withLength(2));

                snaps = [];
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);
                assert("Received events", snaps, is.array.withLength(0));
            });

            it('Should send initial child_added from existing', () => {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_added', (data) => snap = data);

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should send child_removed on explict parent replace', () => {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_removed', (data) => snap = data);

                root.handleChange('/node', { data2: 'ciao' }, dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should send child_removed on partial update', () => {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_removed', (data) => snap = data);

                root.handleChange('/node', { data: null, $i: true }, dummyProg++);

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should combine child added, removed and value', () => {
                root.handleChange('/list', { a: 1, b: 2, c: 3, d: 4 }, dummyProg++);

                var ref = root.getUrl('/list');
                var adds: Client.RDb3Snap[] = [];
                var rems: Client.RDb3Snap[] = [];

                ref.on('child_added', (data) => adds.push(data));
                ref.on('child_removed', (data) => rems.push(data));

                assert("Received initial child_addeds", adds, is.array.withLength(4));
                assert("Received no initial child_removed", rems, is.array.withLength(0));

                adds = [];

                root.handleChange('/list', { a: 1, c: 3, e: 5, f: 6 }, dummyProg++);

                assert("Received new child_addeds", adds, is.array.withLength(2));
                assert("Received new child_removed", rems, is.array.withLength(2));

                adds = [];
                rems = [];

                root.handleChange('/list', {}, dummyProg++);

                assert("Received no child_addeds on delete", adds, is.array.withLength(0));
                assert("Received all child_removeds", rems, is.array.withLength(4));
            });

            it('Should not send child added on empty', () => {
                var obj = { a: {val: 1}, b: {val: 2}, c: {val: 3}, d: {val: 4} };
                root.handleChange('/list', obj, dummyProg++);

                var ref = root.getUrl('/list');
                var adds: Client.RDb3Snap[] = [];
                var rems: Client.RDb3Snap[] = [];

                ref.on('child_added', (data) => adds.push(data));
                ref.on('child_removed', (data) => rems.push(data));

                assert("Received initial child_addeds", adds, is.array.withLength(4));

                var refs :Tsdb.Spi.DbTree[] = [];
                for (var k in obj) {
                    root.getUrl('/list/' + k + '/val').on('value', (ds)=>{});
                }

                adds = [];

                for (var k in obj) {
                    root.handleChange('/list/' + k, null, dummyProg++);
                }

                assert("Received no child_addeds on delete with explicit null", adds, is.array.withLength(0));
                
                for (var k in obj) {
                    root.handleChange('/list/' + k + '/val', null, dummyProg++);
                }

                assert("Received no child_addeds on deleted element nested nullification", adds, is.array.withLength(0));
                assert("Received all child_removeds", rems, is.array.withLength(4));
            });


            /*
			it('Should send child_moved',()=>{
				mock.setData('/list',{a:1,b:2,c:3,d:4});

				var ref = mock.getUrl('/list');
				var movs :Tsdb.Spi.DbTreeSnap[] = [];
				
				ref.on('child_moved', (data)=>movs.push(data));
				
				assert("Received no initial child_moved", movs, is.withLength(0));
				//mock.setData('/list',{b:2,a:1,c:3,e:5,f:6});
				//assert("Received new child_moved", movs, is.withLength(3));
			});
            */

            it('Should send child_changed', () => {
                root.handleChange('/list', { a: 1, b: 2, c: 3 }, dummyProg++);

                var ref = root.getUrl('/list');
                var movs: Client.RDb3Snap[] = [];

                ref.on('child_changed', (data) => movs.push(data));

                assert("Received no initial child_changed", movs, is.array.withLength(0));

                root.handleChange('/list', { b: 2, a: 1, c: 4 }, dummyProg++);

                assert("Received new child_changed", movs, is.array.withLength(1));
            });

            it('Should send child_changed for deep change', () => {
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++);

                var ref = root.getUrl('/list');
                var movs: Client.RDb3Snap[] = [];

                ref.on('child_changed', (data) => movs.push(data));

                assert("Received no initial child_changed", movs, is.array.withLength(0));

                root.handleChange('/list', { b: { val: 2 }, a: { val: 1 }, c: { val: 4 } }, dummyProg++);
                
                assert("Received new child_changed", movs, is.array.withLength(1));
            });
        });
    });

    describe('Queries >',()=>{
        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });

        describe('Events >', ()=>{
            it('Should notify query of child_added, child_changed and child_removed', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                var value :any = null;
                ref.on('value', (data) => {
                    value = data.val();
                });

                var adds: Client.RDb3Snap[] = [];
                ref.on('child_added', (data) => adds.push(data));

                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '1a');

                assert("Received child_added", adds, is.array.withLength(3));
                for (var i = 0; i < adds.length; i++) {
                    assert("Received snapshots does not expose url meta-path", adds[i].ref().url.substr(0,6), '/list/');
                }

                assert("Value events not sent yet", value, is.falsey);

                root.receivedQueryDone({q:'1a'});

                assert("Value events sent correctly", value, is.strictly.object.matching({a:is.object, b:is.object, c:is.object}));

                var rems: Client.RDb3Snap[] = [];
                var chng: Client.RDb3Snap[] = [];
                ref.on('child_removed', (data) => rems.push(data));
                ref.on('child_changed', (data) => chng.push(data));

                root.handleChange('/list', { a: { val: 3 }, b: { val: 4 }, $i:true }, dummyProg++, '1a');

                assert("Received child_changed", chng, is.array.withLength(2));
                for (var i = 0; i < chng.length; i++) {
                    assert("Received snapshots does not expose url meta-path", chng[i].ref().url.substr(0,6), '/list/');
                }

                root.handleChange('/list', { b: { val: 4 } }, dummyProg++, '1a');
                assert("Received child_removed", rems, is.array.withLength(2));
                for (var i = 0; i < rems.length; i++) {
                    assert("Received snapshots does not expose url meta-path", rems[i].ref().url.substr(0,6), '/list/');
                }
            });

            it('Should notify query of child_changed from nested', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                var rems: Client.RDb3Snap[] = [];
                var chng: Client.RDb3Snap[] = [];
                ref.on('child_removed', (data) => rems.push(data));
                ref.on('child_changed', (data) => chng.push(data));


                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '1a');

                assert("Received no initial child_changed", chng, is.array.withLength(0));

                root.handleChange('/list/a/val', 5, dummyProg++, '1a');

                assert("Received first child_changed", chng, is.array.withLength(1));
                for (var i = 0; i < chng.length; i++) {
                    assert("Received changed snapshots does not expose url meta-path", chng[i].ref().url.substr(0,6), '/list/');
                }

                root.handleChange('/list/b', null, dummyProg++, '1a');
                assert("Received child_removed", rems, is.array.withLength(1));
                for (var i = 0; i < rems.length; i++) {
                    assert("Received removed snapshots does not expose url meta-path", rems[i].ref().url.substr(0,6), '/list/');
                }
            });
        });

        describe('Filters >', ()=>{
            it('Should return only "valued" entries', ()=>{
                var ref = root.getUrl('/users');

                root.handleChange('/users', { u1: {name: 'sara'}, u2: {name: 'simone'}}, dummyProg++);

                ref = ref.orderByChild('name').equalTo('mario');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                var adds :Client.RDb3Snap[] = [];
                var vals :Client.RDb3Snap[] = [];
                ref.on('child_added', (data,prek) => {adds.push(data)});
                ref.on('value', (data,prek) => {vals.push(data)});

                assert("Should have sent no values", vals, is.array.withLength(0));
                assert("Should have sent no added", adds, is.array.withLength(0));

                root.handleChange('/users', { u3: {name: 'mario'}, $i : true }, dummyProg++, '1a');
                root.receivedQueryDone({q:'1a'});

                assert("Received child_added", adds, is.array.withLength(1));
                assert("Received value", vals, is.array.withLength(1));
                assert("Received right value", vals[0].child('u3').val(), is.object.matching({name:'mario'}));

                adds = []; vals = [];

                ref.on('child_added', (data,prek) => {adds.push(data)});
                ref.on('value', (data,prek) => {vals.push(data)});

                assert("Received child_added on new subscription", adds, is.array.withLength(1));
                assert("Received value on new subscription", vals, is.array.withLength(1));
            });
        });

        describe('Sorting >', ()=>{
            it('Should notify query child_added sorted on first set', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                var adds :Client.RDb3Snap[] = [];
                var preks :string[] = []; 
                var items :string[] = [];
                ref.on('child_added', (data,prek) => {adds.push(data);preks.push(prek);items.push(data.key())});

                root.handleChange('/list', { a: { val: 3 }, b: { val: 2 }, c: { val: 1 } }, dummyProg++, '1a');

                assert("Received child_added", adds, is.array.withLength(3));
                assert("Keys are sorted", items, is.array.equals(['c','b','a']));
                assert("Pre keys are correct", preks, is.array.equals([null,'c','b']));
            });

            it('Should notify query child_changed (and child_moved) with new position', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                ref.on('child_added', (data,prek) => {});

                root.handleChange('/list', { a: { val: 1 }, b: { val: 3 }, c: { val: 5 } }, dummyProg++, '1a');

                var adds :Client.RDb3Snap[] = [];
                var preks :string[] = []; 
                var items :string[] = [];
                ref.on('child_changed', (data,prek) => {adds.push(data);preks.push(prek);items.push(data.key())});

                root.handleChange('/list/c/val', 2, dummyProg++, '1a');

                assert("Kys are sorted", items, is.array.equals(['c']));
                assert("Pre keys are correct at first round", preks, is.array.equals(['a']));

                ref.off('child_changed');

                var preks :string[] = []; 
                var items :string[] = [];
                ref.on('child_moved', (data,prek) => {adds.push(data);preks.push(prek);items.push(data.key())});

                root.handleChange('/list/c/val', 5, dummyProg++, '1a');

                assert("Kys are sorted", items, is.array.equals(['c']));
                assert("Pre keys are correct at second round", preks, is.array.equals(['b']));
            });
            

            // TODO child_moved on child removal

            it('Should remove excess elements', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val').limitToFirst(3);
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                var adds :Client.RDb3Snap[] = [];
                ref.on('child_added', (data,prek) => {adds.push(data)});
                var rems :Client.RDb3Snap[] = [];
                ref.on('child_removed', (data,prek) => {rems.push(data)});

                root.handleChange('/list', { a: { val: 5 }, b: { val: 6 }, c: { val: 7 } }, dummyProg++, '1a');

                assert("Received child_added", adds, is.array.withLength(3));

                adds=[];

                root.handleChange('/list/d', {val:1}, dummyProg++, '1a');

                assert("Received new child_added", adds, is.array.withLength(1));
                assert("Received child_removed", rems, is.array.withLength(1));
                assert("Removed the last element", rems[0].key(), 'c');

                root.handleChange('/list/d/val', 7, dummyProg++, '1a');
                adds = [];
                rems = [];
                root.handleChange('/list', { x:{val:1}, y:{val:2}, $i:true}, dummyProg++, '1a');

                assert("Received new child_added", adds, is.array.withLength(2));
                assert("Received child_removed", rems, is.array.withLength(2));
                assert("Removed the last element", rems[0].key(), 'b');
                assert("Removed the last element", rems[1].key(), 'd');
            });
        });
    });

    describe('Writing >', ()=>{
        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });

        it('Should update data locally', ()=>{
            var ref = root.getUrl('/list');

            var valds :Client.RDb3Snap;
            ref.on('value', (ds)=>valds = ds);

            assert('No value sent yet', valds, is.undefined);

            ref.set({a:1,b:2});

            assert('Value set after first set', valds, is.object);
            assert('Value correct after first set', valds.val(), is.object.matching({a:1,b:2}));

            valds = null;

            ref.set({c:3,d:4});

            assert('Value set after second set', valds, is.object);
            assert('Value correct after second set', valds.val(), is.strictly.object.matching({c:3,d:4}));
            
            valds = null;

            ref.update({d:6,e:7});

            assert('Value set after update', valds, is.object);
            assert('Value correct after update', valds.val(), is.strictly.object.matching({c:3,d:6,e:7}));

            valds = null;

            ref.remove();

            assert('Value event sent after delete', valds, is.truthy);
            assert('Value set after delete', valds, is.object);
            assert('Value correct after delete', valds.exists(), false);
       });
    });

    describe('Operating on root >', ()=>{
        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });
        it('Should write and erase on root', ()=>{
            var tr = root.getUrl('/');
            var list = tr.child('list');

            var listval :Client.RDb3Snap;
            var trval :Client.RDb3Snap;

            var listcb = list.on('value', (ds)=>{listval = ds});
            var trcb = tr.on('value', (ds)=>{trval = ds});

            var val = {list:{a:1,b:2},other:{c:3,d:4}}; 
            var check = JSON.parse(JSON.stringify(val));

            tr.set(val);

            assert("Root value set", trval.val(), is.object.matching(check));
            assert("List value set", listval.val(), is.object.matching(check.list));


            tr.set(null);

            assert("Root value unset", trval.val(), null);
            // TODO this is about propagating nullification to children
            //assert("List value unset", listval.val(), null);

            tr.off('value', trcb);
            trval = null;

            tr.set({a:1});

            assert("Root value unchanged", trval, null);

        });
    });

    interface SocketEvent {
        event :string;
        match :any;
        answer? :any[];
    }

    interface CheckPromise<T> extends Promise<T> {
        stop();
    }

    interface Socket {
        id :string;
        on(event :string, cb :(...args :any[])=>any) :any;
        emit(event :string, ...args :any[]) :any;
        removeListener(event :string, cb :(...args :any[])=>any) :any;
        removeAllListeners() :void;
    }

    function checkEvents(conn :Socket, events :SocketEvent[], anyOrder = false) :CheckPromise<SocketEvent[]> {
        var ret :SocketEvent[] = [];
        var cbs = {};
        var inerror = false;
        var cp = <CheckPromise<SocketEvent[]>>new Promise<SocketEvent[]>((res,err) => {
            var evtIds :{[index:string]:boolean} = {
                sp:true,
                up:true,
                sq:true,
                uq:true,
                s:true,
                m:true
            };
            var acevt = 0;
            for (let k in evtIds) {
                var cb = (obj) => {
                    try {
                        ret.push({event:k, match: obj, answer: null});
                        assert("Got too many events", events, is.not.array.withLength(0));
                        if (anyOrder) {
                            var found = false;
                            var match :Matcher<any> = null;
                            for (var i = 0; i < events.length; i++) {
                                var acevobj = events[i];
                                if (acevobj.event != k) continue;
                                match = matcherOrEquals(acevobj.match);
                                if (match.matches(obj)) {
                                    events.splice(i,1);
                                    found = true;
                                    if (acevobj.answer) {
                                        conn.emit.apply(conn, acevobj.answer);
                                    }
                                    break;
                                }
                            }
                            if (!found) {
                                assert("There is a matching event", obj, match);
                            }
                        } else {
                            var acevobj = events.shift();
                            assert("Checking event " + (acevt++) + " of type " + acevobj.event, obj, acevobj.match);
                            if (acevobj.answer) {
                                conn.emit.apply(conn, acevobj.answer);
                            }
                        }
                        if (events.length == 0) res(ret);
                    } catch (e) {
                        console.log("Received events", ret);
                        inerror = true;
                        err(e);
                    }
                };
                conn.on(k, cb);
                cbs[k] = cb;
            }
        });
        cp.stop = ()=>{
            for (var k in cbs) {
                conn.removeListener(k, cbs[k]);
            }
            assert("Previous error while checking events", inerror, false);
        };
        return cp;
    }


    describe('E2E >', ()=>{
        var sockserver :SocketIO.Server;
        var ssock :SocketIO.Socket;
        var csock :SocketIOClient.Socket;
        beforeEach(function (done) {
            if (sockserver) {
                sockserver.close();
                ssock = null;
            }
            sockserver = SocketIO.listen(5000);
            if (csock) {
                csock.removeAllListeners();
                csock.close();
            }
            var socketOptions ={
                transports: ['websocket'],
                'force new connection': true
            };
            csock = SocketIOClient.connect('http://0.0.0.0:5000', socketOptions);

            root = <any>new Client.RDb3Root(csock, 'http://ciao/');
            root.whenReady().then(()=>{
                done();
            });

            sockserver.on('connection', (sock)=>{
                if (!ssock) ssock = sock;
                sock.emit('aa');
            });
        });

        it('Should not send immediate sp-up pairs', ()=>{
            var ref = root.getUrl('/users/u1');
            var cep = checkEvents(ssock, [
                {
                    event: 'sp',
                    match: '/users/u1',
                    answer: ['v',{p:'/users/u1', v:{name:'Simone',surname:'Gianni'}}]
                }
            ]);
            ref.on('value', (ds)=>{});
            return cep.then(()=>{
                // TODO wait for the value event to actually arrive
                return wait(500);
            }).then(()=>{
                var sub = root.getUrl('/users/u1/name');
                return new Promise<Client.RDb3Snap>((res)=>{
                    sub.once('value', (ds)=>{res(ds)});
                });
            }).then((ds)=>{
                assert("Returned right value", ds.val(), 'Simone');
                cep.stop();
            });
        })

        it('Should not send immediate up-sp pairs', ()=>{
            var ref = root.getUrl('/users/u1');
            var cep = checkEvents(ssock, [
                {
                    event: 'sp',
                    match: '/users/u1',
                    answer: ['v',{p:'/users/u1', v:{name:'Simone',surname:'Gianni'}}]
                }
            ]);
            var cb = ref.on('value', (ds)=>{});
            return cep.then(()=>{
                // TODO wait for the value event to actually arrive
                return wait(500);
            }).then(()=>{
                // Unsubscribe
                ref.off('value', cb);
                cb = ref.on('value', (ds)=>{});
                return wait(500);
            }).then(()=>{
                cep.stop();
                cep = checkEvents(ssock, [
                    {
                        event: 'up',
                        match: '/users/u1'
                    }
                ]);
                ref.off('value', cb);
                return cep;
            }).then(()=>{
                return wait(500);
            }).then(()=>{
                cep.stop();
            });
        });

        
    });


    describe('Performance >', ()=>{
        it('PF1 Parsing performance without listeners', function () {
            this.timeout(35000);

            var bigdata :any = {};
            for (var i = 0; i < 100; i++) {
                var usdata :any = {
                    name: 'user' + i,
                    surname: 'user' + i,
                    friends: {}
                };

                for (var j = 0; j < 10; j++) {
                    usdata.friends['friend' + j] = {
                        _ref: 'firend' + j
                    };
                }

                bigdata['user' + i] = usdata;
            }


            var inc = 0;
            var suite = new Benchmark.Suite("test")
            .add("simple parsing", ()=>{
                inc++;
                root = <any>new Client.RDb3Root(null, 'http://ciao/');
                root.handleChange('/users',bigdata, 4);
            })
            .on('complete', function() {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.012773601477272726  dev: 0.001411317392724511");
                console.log("CNG : " + (stats.mean - 0.012773601477272726) + " : " + (stats.mean/0.012773601477272726));
                console.log("Inc : " + inc);
            })
            .run();

            var data = root.getValue('/users');
            assert("Value is right", data, is.object.matching(bigdata));
        });

        it('PF2 Parsing performance with child listeners', function () {
            this.timeout(35000);

            var bigdata :any = {};
            for (var i = 0; i < 100; i++) {
                var usdata :any = {
                    name: 'user' + i,
                    surname: 'user' + i,
                    friends: {}
                };

                for (var j = 0; j < 10; j++) {
                    usdata.friends['friend' + j] = {
                        _ref: 'firend' + j
                    };
                }

                bigdata['user' + i] = usdata;
            }


            var inc = 0;
            var suite = new Benchmark.Suite("test")
            .add("parsing with events", ()=>{
                inc++;
                root = <any>new Client.RDb3Root(null, 'http://ciao/');
                var ref = root.getUrl('/users');
                ref.on('value', ()=>{});
                ref.on('child_added', ()=>{});
                root.handleChange('/users',bigdata, 4);
            })
            .on('complete', function() {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.014293066598591544  dev: 0.00205628694474153");
                console.log("CNG : " + (stats.mean - 0.014293066598591544) + " : " + (stats.mean/0.014293066598591544));
                console.log("Inc : " + inc);
            })
            .run();

            var data = root.getValue('/users');
            assert("Value is right", data, is.object.matching(bigdata));
        });

        it('PF3 Parsing performance with real child listeners', function () {
            this.timeout(35000);

            var bigdata :any = {};
            for (var i = 0; i < 100; i++) {
                var usdata :any = {
                    name: 'user' + i,
                    surname: 'user' + i,
                    friends: {}
                };

                for (var j = 0; j < 10; j++) {
                    usdata.friends['friend' + j] = {
                        _ref: 'firend' + j
                    };
                }

                bigdata['user' + i] = usdata;
            }


            var inc = 0;
            var suite = new Benchmark.Suite("test")
            .add("parsing with events", ()=>{
                inc++;
                root = <any>new Client.RDb3Root(null, 'http://ciao/');
                var ref = root.getUrl('/users');
                ref.on('value', (ds)=>{ ds.val(); });
                ref.on('child_added', (ds)=>{ ds.val(); });
                root.handleChange('/users',bigdata, 4);
            })
            .on('complete', function() {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.008502651874755384  dev: 0.0005244241768842533");
                console.log("CNG : " + (stats.mean - 0.008502651874755384) + " : " + (stats.mean/0.008502651874755384));
                console.log("Inc : " + inc);
            })
            .run();

            var data = root.getValue('/users');
            assert("Value is right", data, is.object.matching(bigdata));
        });
        
    });
});

    function lazyExtend(prev :any, next :any) {
        if (!prev) return;
        for (var k in next) {
            var val = next[k];
            if (typeof(val) !== 'object') continue;
            lazyExtend(prev[k], val);
        }
        if (!next.toJSON) next.toJSON = jsonAll;
        Object.setPrototypeOf(next,prev);
    }

    function jsonAll() {
        var tmp = {};
        for(var key in this) {
            var to = typeof this[key];
            if(to !== 'function')
                tmp[key] = this[key];
        }
        return tmp;
    }



function wait(to :number) :Promise<any> {
    return new Promise<any>((res,rej)=>{
        setTimeout(()=>res(null), to);
    });
}
