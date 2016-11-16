"use strict";
//Debug.enable('tsdb:*');
var Benchmark = require('benchmark');
var Client = require('../main/Client');
var SocketIO = require('socket.io');
var SocketIOClient = require('socket.io-client');
var tsmatchers_1 = require('tsmatchers');
var tsMatchers_1 = require('tsmatchers/js/main/tsMatchers');
var dummyProg = 1;
var root;
describe('RDb3Client >', function () {
    describe('Metadata >', function () {
        it('Should binary-search find stuff', function () {
            var md = new Client.Metadata();
            md.sorted = ['1', '3', '5', '7'];
            for (var i = 0; i < md.sorted.length; i++) {
                tsmatchers_1.assert("Find element " + i, md.binaryIndexOf(md.sorted[i]), tsmatchers_1.is.array.equals([true, i]));
            }
            tsmatchers_1.assert("Should not find non present", md.binaryIndexOf('ciao')[0], false);
            tsmatchers_1.assert("Should find insertion point", md.binaryIndexOf('2'), tsmatchers_1.is.array.equals([false, 1]));
            tsmatchers_1.assert("Should find insertion point", md.binaryIndexOf('4'), tsmatchers_1.is.array.equals([false, 2]));
            tsmatchers_1.assert("Should find insertion point", md.binaryIndexOf('6'), tsmatchers_1.is.array.equals([false, 3]));
            tsmatchers_1.assert("Should find insertion point", md.binaryIndexOf('8'), tsmatchers_1.is.array.equals([false, 4]));
            tsmatchers_1.assert("Should find insertion point", md.binaryIndexOf('9'), tsmatchers_1.is.array.equals([false, 4]));
        });
        it('Should correctly delete elements', function () {
            var md = new Client.Metadata();
            md.sorted = ['1', '3', '5', '7'];
            var ret = md.modifySorted(['1'], [false]);
            tsmatchers_1.assert("modified the array", md.sorted, tsmatchers_1.is.array.equals(['3', '5', '7']));
            tsmatchers_1.assert("returned one element", ret, tsmatchers_1.is.array.withLength(1));
            tsmatchers_1.assert("the returned element is empty", ret[0], tsmatchers_1.is.strictly.object.matching({ prev: tsmatchers_1.is.falsey }));
        });
        it('Should correctly add elements', function () {
            var md = new Client.Metadata();
            md.sorted = ['1', '3', '5', '7'];
            var ret = md.modifySorted(['2'], [true]);
            tsmatchers_1.assert("modified the array", md.sorted, tsmatchers_1.is.array.equals(['1', '2', '3', '5', '7']));
            tsmatchers_1.assert("returned the addition", ret, tsmatchers_1.is.array.withLength(1));
            tsmatchers_1.assert("returned the right values", ret[0], tsmatchers_1.is.object.matching({ prev: tsmatchers_1.is.falsey, actual: '1', index: 1 }));
        });
        it('Should add, remove and reorder elements', function () {
            var md = new Client.Metadata();
            md.sorted = ['1', '3', '5', '7'];
            var ret = md.modifySorted(['2', '5', '7'], [true, false, null]);
            tsmatchers_1.assert("modified the array", md.sorted, tsmatchers_1.is.array.equals(['1', '2', '3', '7']));
            tsmatchers_1.assert("returned the addition", ret, tsmatchers_1.is.array.withLength(3));
            tsmatchers_1.assert("returned the right values for add", ret[0], tsmatchers_1.is.object.matching({ prev: tsmatchers_1.is.falsey, actual: '1' }));
            tsmatchers_1.assert("returned the right values for remove", ret[1], tsmatchers_1.is.array.withLength(0));
            tsmatchers_1.assert("returned the right values for moved", ret[2], tsmatchers_1.is.object.matching({ prev: '5', actual: '3' }));
        });
    });
    describe('Local data >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        describe('Reading >', function () {
            it('Should not find root non existing data', function () {
                tsmatchers_1.assert("Should return undefined", root.getValue('/node'), tsmatchers_1.is.undefined);
                tsmatchers_1.assert("Should not have polluted data", root.data, tsmatchers_1.is.strictly.object.matching({}));
            });
            it('Should find root existing data', function () {
                root.data['node'] = 'ciao';
                tsmatchers_1.assert("Should return a string", root.getValue('/node'), 'ciao');
            });
            it('Should not find sub non existing data', function () {
                tsmatchers_1.assert("Should return undefined", root.getValue('/node/subnode'), tsmatchers_1.is.undefined);
            });
            it('Should not find sub non existing of primitive', function () {
                root.data['node'] = 'ciao';
                tsmatchers_1.assert("Should return undefined", root.getValue('/node/subnode'), tsmatchers_1.is.undefined);
            });
            it('Should not find sub non existing of primitive', function () {
                root.data['node'] = 'ciao';
                tsmatchers_1.assert("Should return undefined", root.getValue('/node/length'), tsmatchers_1.is.undefined);
            });
            it('Should not find sub non existing leaf', function () {
                root.data['node'] = { pippo: 'bah' };
                tsmatchers_1.assert("Should return undefined", root.getValue('/node/subnode'), tsmatchers_1.is.undefined);
            });
            it('Should find leaf existing data', function () {
                root.data['node'] = { subnode: 'ciao' };
                tsmatchers_1.assert("Should return a string", root.getValue('/node/subnode'), 'ciao');
            });
        });
        describe('Writing >', function () {
            it('Should write root primitive', function () {
                root.handleChange('/node', 'ciao', dummyProg++);
                tsmatchers_1.assert("Should return string", root.data['node'], 'ciao');
            });
            it('Should write sub primitive', function () {
                root.handleChange('/node/sub', 'ciao', dummyProg++);
                tsmatchers_1.assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should overwrite sub primitive', function () {
                root.handleChange('/node/sub', 'ciao', dummyProg++);
                root.handleChange('/node/sub', 'pippo', dummyProg++);
                tsmatchers_1.assert("Should return string", root.data['node']['sub'], 'pippo');
            });
            it('Should write sub primitive with alternative url', function () {
                root.handleChange('node/sub/', 'ciao', dummyProg++);
                tsmatchers_1.assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write object', function () {
                root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, dummyProg++);
                console.log(root.data);
                tsmatchers_1.assert("Should return plain object", root.data['node'], tsmatchers_1.is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should merge subs', function () {
                root.handleChange('/node', { sub1: 'ciao' }, dummyProg++);
                root.handleChange('/node/sub2', 'altro', dummyProg++);
                tsmatchers_1.assert("Should return merged object", root.data['node'], tsmatchers_1.is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should overwrite subs', function () {
                root.handleChange('/node/sub2', 'altro', dummyProg++);
                root.handleChange('/node', { sub1: 'ciao' }, dummyProg++);
                tsmatchers_1.assert("Should return merged object", JSON.stringify(root.data['node']['sub2']), tsmatchers_1.is.undefined);
            });
            describe('Versioned >', function () {
                it('Should not override leaf with previous version', function () {
                    root.handleChange('/node/sub2', 'altro', 2);
                    root.handleChange('/node/sub2', 'ultro', 1);
                    tsmatchers_1.assert("Should be the first version", root.data['node'], tsmatchers_1.is.object.matching({
                        sub2: 'altro'
                    }));
                });
                it('Should not override object with previous version', function () {
                    root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, 2);
                    root.handleChange('/node', { sub1: 'aaa', sub2: 'bbb' }, 1);
                    tsmatchers_1.assert("Should be the first version", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));
                    root.handleChange('/node/sub2', 'ultro', 1);
                    tsmatchers_1.assert("Should be the first version", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));
                });
                it('Should not override from root', function () {
                    root.handleChange('/withProps', { wp1: { str: 'ciao' }, wp2: 'altro' }, 3);
                    root.handleChange('/withProps/wp1/str', 'pippo', 34);
                    root.handleChange('', { withProps: { wp1: { str: 'ciao' }, wp2: 'altro' } }, 33);
                    tsmatchers_1.assert("Should be the first version", root.data['withProps'], tsmatchers_1.is.object.matching({
                        wp1: { str: 'pippo' },
                        wp2: 'altro'
                    }));
                });
                it('Should not override object with previous null', function () {
                    root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' }, 2);
                    root.handleChange('/node/sub3', 'ancora', 3);
                    root.handleChange('/node', { sub1: 'aaa' }, 2);
                    tsmatchers_1.assert("Should ignore missing sub3", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'aaa',
                        sub3: 'ancora'
                    }));
                    root.handleChange('/node/sub3', null, 2);
                    tsmatchers_1.assert("Should ignore explicit nullified sub3", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'aaa',
                        sub3: 'ancora'
                    }));
                });
                it('Should override partials with previous version', function () {
                    root.handleChange('/node', { sub1: 'aaa', sub2: 'bbb' }, 1);
                    root.handleChange('/node/sub2', 'altro', 4);
                    root.handleChange('/node/sub1', 'ciao', 2);
                    tsmatchers_1.assert("Should be a mix of versions", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'ciao',
                        sub2: 'altro'
                    }));
                    root.handleChange('/node', { sub1: 'leaks', sub2: 'doesnot' }, 3);
                    tsmatchers_1.assert("Should be the first version", root.data['node'], tsmatchers_1.is.object.matching({
                        sub1: 'leaks',
                        sub2: 'altro'
                    }));
                });
            });
        });
    });
    describe('Higher layer >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        describe('Shapshot >', function () {
            it('.exists should work', function () {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                tsmatchers_1.assert('Should return true for string', snap.exists(), true);
                snap = new Client.RDb3Snap(0, root, '/test/node');
                tsmatchers_1.assert('Should return true for zero', snap.exists(), true);
                snap = new Client.RDb3Snap(null, root, '/test/node');
                tsmatchers_1.assert('Should return false for null', snap.exists(), false);
                snap = new Client.RDb3Snap(undefined, root, '/test/node');
                tsmatchers_1.assert('Should return false for undefined', snap.exists(), false);
            });
            it('.key should work', function () {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                tsmatchers_1.assert("Should return last segment", snap.key(), 'node');
            });
            it('.val should return native value', function () {
                var snap = new Client.RDb3Snap('ciao', root, '/test/node');
                tsmatchers_1.assert('Should return string', snap.val(), 'ciao');
                snap = new Client.RDb3Snap(0, root, '/test/node');
                tsmatchers_1.assert('Should return zero', snap.val(), 0);
            });
            it('.val should return object', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                tsmatchers_1.assert('Should return object', snap.val(), tsmatchers_1.is.strictly.object.matching({ sub: { val: 'ciao' }, oth: 1 }));
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
            it('.child should return native direct child', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('oth');
                tsmatchers_1.assert("Should return native child", child.val(), 1);
            });
            it('.child should return object direct child', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('sub');
                tsmatchers_1.assert("Should return native child", child.val(), tsmatchers_1.is.strictly.object.matching({ val: 'ciao' }));
            });
            it('.child should return native grand child', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var child = snap.child('sub/val');
                tsmatchers_1.assert("Should return native child", child.val(), 'ciao');
            });
            it('.child should return object grand child', function () {
                var snap = new Client.RDb3Snap({ sub: { val: { inner: 'ciao' } } }, root, '/test/node');
                var child = snap.child('sub/val');
                tsmatchers_1.assert("Should return native child", child.val(), tsmatchers_1.is.strictly.object.matching({ inner: 'ciao' }));
            });
            it('.forEach cycles all children', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var subs = [];
                snap.forEach(function (sub) {
                    subs.push(sub);
                    if (sub.key() == 'sub') {
                        tsmatchers_1.assert("Should return native child", sub.val(), tsmatchers_1.is.strictly.object.matching({ val: 'ciao' }));
                    }
                    else if (sub.key() == 'oth') {
                        tsmatchers_1.assert("Should return native child", sub.val(), 1);
                    }
                    else {
                        tsmatchers_1.assert("Should not have returned this key", sub.key(), '_should not be');
                    }
                });
                tsmatchers_1.assert("Should cycle on two children", subs, tsmatchers_1.is.array.withLength(2));
            });
            it('.forEach should stop on true', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var subs = [];
                snap.forEach(function (sub) {
                    subs.push(sub);
                    return true;
                });
                tsmatchers_1.assert("Should cycle on one child only", subs, tsmatchers_1.is.array.withLength(1));
            });
        });
        describe('Value event >', function () {
            it('Should send a value event and off it', function () {
                var ref = root.getUrl('/node/data');
                var snap;
                var ctx = "ciao";
                var fn = ref.on('value', function (data) { return snap = data; }, null, ctx);
                root.handleChange('/node/data', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                snap = null;
                ref.off('value', fn, ctx);
                root.handleChange('/node/data', 'ciao2', dummyProg++);
                tsmatchers_1.assert("Should not receive another event", snap, tsmatchers_1.is.falsey);
            });
            it('Should off the right event', function () {
                var ref = root.getUrl('/node');
                var evts = [];
                var fn_value = ref.on('value', function (data) { return evts.push('v'); });
                var fn_child_added = ref.on('child_added', function (data) { return evts.push('ca'); });
                var fn_child_removed = ref.on('child_removed', function (data) { return evts.push('cr'); });
                root.handleChange('/node', { a: 1 }, dummyProg++);
                root.handleChange('/node', { c: 3 }, dummyProg++);
                tsmatchers_1.assert("Right events in right order", evts, tsmatchers_1.is.array.equals(['ca', 'v', 'ca', 'cr', 'v']));
                ref.off('value', fn_value);
                evts = [];
                root.handleChange('/node', { d: 5 }, dummyProg++);
                tsmatchers_1.assert("Right events in right order after off", evts, tsmatchers_1.is.array.equals(['ca', 'cr']));
                ref.off('child_added', fn_child_added);
                ref.off('child_removed', fn_child_removed);
                evts = [];
                root.handleChange('/node', { e: 5 }, dummyProg++);
                tsmatchers_1.assert("No more events", evts, tsmatchers_1.is.array.withLength(0));
            });
            it('Should send a value event for already existing data', function () {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node/data');
                var snap;
                var fn = ref.on('value', function (data) { return snap = data; });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should not send a value for existing but not loaded data', function () {
                root.handleChange('/node/data/sub', 'ciao', dummyProg++);
                tsmatchers_1.assert("/node is incomplete", root.getOrCreateMetadata('/node').incomplete, true);
                tsmatchers_1.assert("/node/data is incomplete", root.getOrCreateMetadata('/node/data').incomplete, true);
                var ref = root.getUrl('/node/');
                var snap;
                var fn = ref.on('value', function (data) { return snap = data; });
                tsmatchers_1.assert("Not yet received event", snap, tsmatchers_1.is.falsey);
                root.handleChange('/node', { data: { sub: 'ciao' } }, dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.strictly.object.matching({ data: { sub: 'ciao' } }));
            });
            it('Should send a value event with once', function () {
                var ref = root.getUrl('/node/data');
                var snap;
                ref.once('value', function (data) { return snap = data; });
                root.handleChange('/node/data', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                snap = null;
                root.handleChange('/node/data', 'ciao2', dummyProg++);
                tsmatchers_1.assert("Should not receive another event", snap, tsmatchers_1.is.falsey);
            });
            it('Should send a value event for outer change', function () {
                var ref = root.getUrl('/node/data');
                var snap;
                ref.on('value', function (data) { return snap = data; });
                root.handleChange('/node', { pippo: 'puppo', data: 'ciao' }, dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should send a value event for inner additions', function () {
                root.handleChange('/node', { oth: 'pippo' }, dummyProg++);
                var ref = root.getUrl('/node');
                var snap;
                ref.on('value', function (data) { return snap = data; });
                snap = null;
                root.handleChange('/node/data', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.strictly.object.matching({ data: 'ciao', oth: 'pippo' }));
            });
            it('Should send a value event for inner changes', function () {
                var ref = root.getUrl('/node');
                root.handleChange('/node', { 'data': 'bau' }, dummyProg++);
                var snap;
                ref.on('value', function (data) { return snap = data; });
                snap = null;
                root.handleChange('/node/data', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.strictly.object.matching({ data: 'ciao' }));
            });
            it('Should correctly handle value events for leafs', function () {
                root.handleChange('/node', {}, dummyProg++);
                root.handleChange('/node/a', {}, dummyProg++);
                root.handleChange('/node', { a: { b: { c: 'bau' } } }, dummyProg++);
                var ref = root.getUrl('/node/a/b');
                var snap = null;
                ref.on('value', function (data) { return snap = data; });
                tsmatchers_1.assert("Received initial event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.object.matching({ c: 'bau' }));
                snap = null;
                root.handleChange('/node/a/b/c', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received second event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Second snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied second event data", snap.val(), tsmatchers_1.is.object.matching({ c: 'ciao' }));
                snap = null;
                root.handleChange('/node/a/b/c', null, dummyProg++);
                tsmatchers_1.assert("Received third event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Third snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied third event data", snap.val(), tsmatchers_1.is.object.matching({ c: tsmatchers_1.is.undefined }));
                snap = null;
                root.handleChange('/node/a/b', null, dummyProg++);
                tsmatchers_1.assert("Received fourth event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Fourth snapshot is existing", snap.exists(), false);
            });
            it("Should send a value event for mere completion", function () {
                var ref1 = root.getUrl('/node/a/b');
                var snap1 = null;
                ref1.on('value', function (data) { return snap1 = data; });
                var ref2 = root.getUrl('/node');
                var snap2 = null;
                ref2.on('value', function (data) { return snap2 = data; });
                root.handleChange('/node/a/b', 'ciao', dummyProg++);
                tsmatchers_1.assert("First event received", snap1, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("First dnapshot is existing", snap1.exists(), true);
                tsmatchers_1.assert("First event data is right", snap1.val(), 'ciao');
                root.handleChange('/node', { a: { b: 'ciao' } }, dummyProg++);
                tsmatchers_1.assert("Second event received", snap2, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Second dnapshot is existing", snap2.exists(), true);
                tsmatchers_1.assert("Second event data is right", snap2.val(), tsmatchers_1.is.object.matching({ a: { b: 'ciao' } }));
                snap1 = snap2 = null;
                root.handleChange('/node/a', { b: 'ciao' }, dummyProg++);
                tsmatchers_1.assert("First event not received again", snap1, tsmatchers_1.is.falsey);
                tsmatchers_1.assert("Second event not received again", snap2, tsmatchers_1.is.falsey);
            });
            it("Should send a value event from inside an initial value event", function () {
                var ref = root.getUrl('/node');
                root.handleChange('/node', { 'data': 'bau' }, dummyProg++);
                var cnt = 0;
                ref.on('value', function (data) {
                    cnt++;
                    if (cnt == 1) {
                        root.handleChange('/node', { 'data': 'bio' }, dummyProg++);
                    }
                });
                tsmatchers_1.assert("sent and received the second event", cnt, 2);
            });
            it('Snapshots are immutable', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('value', function (data) { return snaps.push(data); });
                root.handleChange('/node', { 'data1': 'bau' }, dummyProg++);
                root.handleChange('/node/data2', 'ciao', dummyProg++);
                root.handleChange('/node/data3', 'miao', dummyProg++);
                root.handleChange('/node/data1', null, dummyProg++);
                root.handleChange('/node/data1', 'pio', dummyProg++);
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(5));
                tsmatchers_1.assert("First snap is only one element", snaps[0].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Second snap is two element", snaps[1].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Third snap is three element", snaps[2].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Fourth snap is two element", snaps[3].val(), tsmatchers_1.is.strictly.object.matching({ data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Third snap is three element", snaps[4].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                var keys = [];
                snaps[0].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in first snap", keys, tsmatchers_1.is.array.equals(['data1']));
                keys = [];
                snaps[1].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in second snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2']));
                keys = [];
                snaps[2].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in third snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2', 'data3']));
                keys = [];
                snaps[3].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in fourth snap", keys, tsmatchers_1.is.array.equals(['data2', 'data3']));
                keys = [];
                snaps[4].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in fifth snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2', 'data3']));
            });
            it('Snapshots are immutable also with nested objects', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('value', function (data) { return snaps.push(data); });
                root.handleChange('/node', { 'data1': { val: 'bau' } }, dummyProg++);
                root.handleChange('/node/data2', { val: 'ciao' }, dummyProg++);
                root.handleChange('/node/data3', { val: 'miao' }, dummyProg++);
                root.handleChange('/node/data1', null, dummyProg++);
                root.handleChange('/node/data1', { val: 'pio' }, dummyProg++);
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(5));
                tsmatchers_1.assert("First snap is only one element", snaps[0].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Second snap is two element", snaps[1].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Third snap is three element", snaps[2].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Fourth snap is two element", snaps[3].val(), tsmatchers_1.is.strictly.object.matching({ data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                tsmatchers_1.assert("Third snap is three element", snaps[4].val(), tsmatchers_1.is.strictly.object.matching({ data1: tsmatchers_1.is.truthy, data2: tsmatchers_1.is.truthy, data3: tsmatchers_1.is.truthy }));
                var keys = [];
                snaps[0].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in first snap", keys, tsmatchers_1.is.array.equals(['data1']));
                keys = [];
                snaps[1].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in second snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2']));
                keys = [];
                snaps[2].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in third snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2', 'data3']));
                keys = [];
                snaps[3].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in fourth snap", keys, tsmatchers_1.is.array.equals(['data2', 'data3']));
                keys = [];
                snaps[4].forEach(function (cs) { keys.push(cs.key()); });
                tsmatchers_1.assert("Right keys in fifth snap", keys, tsmatchers_1.is.array.equals(['data1', 'data2', 'data3']));
            });
        });
        describe('Known missing >', function () {
            it('Should send a value event for confirmed null, also on second call', function () {
                root = new Client.RDb3Root(null, 'http://ciao/');
                var ref = root.getUrl('/node');
                var snap;
                var cb = ref.on('value', function (data) { return snap = data; });
                root.handleChange('/node', null, dummyProg++);
                console.log(root.data);
                tsmatchers_1.assert("Received first event", snap, tsmatchers_1.is.truthy);
                console.log(snap.val());
                tsmatchers_1.assert("First snapshot is non existing", snap.exists(), false);
                snap = null;
                ref.on('value', function (data) { return snap = data; });
                ref.off('value', cb);
                tsmatchers_1.assert("Received second value event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Second snapshot is non existing", snap.exists(), false);
            });
            it('Should properly replace a known missing with a new value', function () {
                var ref = root.getUrl('/node');
                root.handleChange('/node/sub1', null, dummyProg++);
                root.handleChange('/node/sub2', null, dummyProg++);
                root.handleChange('/node/sub1', { name: 'simone' }, dummyProg++);
                root.handleChange('/node', { 'sub2': { name: 'simone' } }, dummyProg++);
                console.log(root.getOrCreateMetadata('/node'));
                var ref = root.getUrl('/node');
                var snap;
                var cb = ref.on('value', function (data) { return snap = data; });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
            });
        });
        describe('Local cache >', function () {
            it('Should not delete children protected by parent', function () {
                root.handleChange('/node', { a: 1, b: 2, c: 3 }, dummyProg++);
                root.subscribe('/node');
                root.subscribe('/node/a');
                tsmatchers_1.assert("Value should be there", root.getValue('/node/a'), 1);
                root.unsubscribe('/node/a');
                tsmatchers_1.assert("Value should still be there and valid", root.getValue('/node'), tsmatchers_1.is.object.matching({ a: 1 }));
                root.unsubscribe('/node');
                tsmatchers_1.assert("Value should not be there anymore", root.getValue('/node'), tsmatchers_1.is.falsey);
            });
            it('Should not delete siblings on the way', function () {
                root.handleChange('/node', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++);
                root.subscribe('/node/a');
                root.unsubscribe('/node/a');
                tsmatchers_1.assert("Value should not be valid anymore", root.getValue('/node/a'), tsmatchers_1.is.falsey);
                tsmatchers_1.assert("Sibling should still be there", root.getValue('/node/b'), tsmatchers_1.is.object.matching({ val: 2 }));
            });
            it('Should preserve children', function () {
                root.handleChange('/node', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++);
                root.subscribe('/node/a');
                root.unsubscribe('/node');
                tsmatchers_1.assert("Sibling should not be valid anymore", root.getValue('/node/b'), tsmatchers_1.is.falsey);
                tsmatchers_1.assert("Value should still be there", root.getValue('/node/a'), tsmatchers_1.is.object.matching({ val: 1 }));
            });
            it('Should preserve grandchildren', function () {
                root.handleChange('/node', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++);
                root.subscribe('/node/a/val');
                root.unsubscribe('/node');
                tsmatchers_1.assert("Sibling should not be valid anymore", root.getValue('/node/b'), tsmatchers_1.is.falsey);
                tsmatchers_1.assert("Value should still be there", root.getValue('/node/a'), tsmatchers_1.is.object.matching({ val: 1 }));
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

            it('Should not clean up, but keep know nulls, if there is subscription', ()=>{
                root.handleChange('/node', {a:{val:1}}, dummyProg++);
                root.subscribe('/node');
                root.handleChange('/node', null, dummyProg++);
                console.log(root.data);
                assert("Data should be with known null", root.data, is.strictly.object.matching({node:is.object, $i: true, $v :is.object}));
            });
            */
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
        describe('Child diff events >', function () {
            it('Should send one child_added from empty', function () {
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_added', function (data) {
                    snap = data;
                });
                root.handleChange('/node/data', 'ciao', dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should send multiple child_added from empty', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('child_added', function (data) { return snaps.push(data); });
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(2));
            });
            it('Should not send child_added for existing', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('child_added', function (data) { return snaps.push(data); });
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(2));
                snaps = [];
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' }, dummyProg++);
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(0));
            });
            it('Should send initial child_added from existing', function () {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_added', function (data) { return snap = data; });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should send child_removed on explict parent replace', function () {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_removed', function (data) { return snap = data; });
                root.handleChange('/node', { data2: 'ciao' }, dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should send child_removed on partial update', function () {
                root.handleChange('/node/data', 'ciao', dummyProg++);
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_removed', function (data) { return snap = data; });
                root.handleChange('/node', { data: null, $i: true }, dummyProg++);
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should combine child added, removed and value', function () {
                root.handleChange('/list', { a: 1, b: 2, c: 3, d: 4 }, dummyProg++);
                var ref = root.getUrl('/list');
                var adds = [];
                var rems = [];
                ref.on('child_added', function (data) { return adds.push(data); });
                ref.on('child_removed', function (data) { return rems.push(data); });
                tsmatchers_1.assert("Received initial child_addeds", adds, tsmatchers_1.is.array.withLength(4));
                tsmatchers_1.assert("Received no initial child_removed", rems, tsmatchers_1.is.array.withLength(0));
                adds = [];
                root.handleChange('/list', { a: 1, c: 3, e: 5, f: 6 }, dummyProg++);
                tsmatchers_1.assert("Received new child_addeds", adds, tsmatchers_1.is.array.withLength(2));
                tsmatchers_1.assert("Received new child_removed", rems, tsmatchers_1.is.array.withLength(2));
                adds = [];
                rems = [];
                root.handleChange('/list', {}, dummyProg++);
                tsmatchers_1.assert("Received no child_addeds on delete", adds, tsmatchers_1.is.array.withLength(0));
                tsmatchers_1.assert("Received all child_removeds", rems, tsmatchers_1.is.array.withLength(4));
            });
            it('Should not send child added on empty', function () {
                var obj = { a: { val: 1 }, b: { val: 2 }, c: { val: 3 }, d: { val: 4 } };
                root.handleChange('/list', obj, dummyProg++);
                var ref = root.getUrl('/list');
                var adds = [];
                var rems = [];
                ref.on('child_added', function (data) { return adds.push(data); });
                ref.on('child_removed', function (data) { return rems.push(data); });
                tsmatchers_1.assert("Received initial child_addeds", adds, tsmatchers_1.is.array.withLength(4));
                var refs = [];
                for (var k in obj) {
                    root.getUrl('/list/' + k + '/val').on('value', function (ds) { });
                }
                adds = [];
                for (var k in obj) {
                    root.handleChange('/list/' + k, null, dummyProg++);
                }
                tsmatchers_1.assert("Received no child_addeds on delete with explicit null", adds, tsmatchers_1.is.array.withLength(0));
                for (var k in obj) {
                    root.handleChange('/list/' + k + '/val', null, dummyProg++);
                }
                tsmatchers_1.assert("Received no child_addeds on deleted element nested nullification", adds, tsmatchers_1.is.array.withLength(0));
                tsmatchers_1.assert("Received all child_removeds", rems, tsmatchers_1.is.array.withLength(4));
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
            it('Should send child_changed', function () {
                root.handleChange('/list', { a: 1, b: 2, c: 3 }, dummyProg++);
                var ref = root.getUrl('/list');
                var movs = [];
                ref.on('child_changed', function (data) { return movs.push(data); });
                tsmatchers_1.assert("Received no initial child_changed", movs, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/list', { b: 2, a: 1, c: 4 }, dummyProg++);
                tsmatchers_1.assert("Received new child_changed", movs, tsmatchers_1.is.array.withLength(1));
            });
            it('Should send child_changed for deep change', function () {
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++);
                var ref = root.getUrl('/list');
                var movs = [];
                ref.on('child_changed', function (data) { return movs.push(data); });
                tsmatchers_1.assert("Received no initial child_changed", movs, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/list', { b: { val: 2 }, a: { val: 1 }, c: { val: 4 } }, dummyProg++);
                tsmatchers_1.assert("Received new child_changed", movs, tsmatchers_1.is.array.withLength(1));
            });
        });
    });
    describe('Queries >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        describe('Events >', function () {
            it('Should notify query of child_added, child_changed and child_removed', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                var value = null;
                ref.on('value', function (data) {
                    value = data.val();
                });
                var adds = [];
                ref.on('child_added', function (data) { return adds.push(data); });
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                for (var i = 0; i < adds.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", adds[i].ref().url.substr(0, 6), '/list/');
                }
                tsmatchers_1.assert("Value events not sent yet", value, tsmatchers_1.is.falsey);
                root.receivedQueryDone({ q: '1a' });
                tsmatchers_1.assert("Value events sent correctly", value, tsmatchers_1.is.strictly.object.matching({ a: tsmatchers_1.is.object, b: tsmatchers_1.is.object, c: tsmatchers_1.is.object }));
                var rems = [];
                var chng = [];
                ref.on('child_removed', function (data) { return rems.push(data); });
                ref.on('child_changed', function (data) { return chng.push(data); });
                root.handleChange('/list', { a: { val: 3 }, b: { val: 4 }, $i: true }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_changed", chng, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < chng.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", chng[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleChange('/list', { b: { val: 4 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < rems.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", rems[i].ref().url.substr(0, 6), '/list/');
                }
            });
            it('Should send correct value', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                var value = null;
                ref.on('value', function (data) {
                    value = data.val();
                });
                var adds = [];
                ref.on('child_added', function (data) { return adds.push(data); });
                root.handleChange('/list/a', { val: 1 }, dummyProg++, '1a');
                root.handleChange('/list/b', { val: 2 }, dummyProg++, '1a');
                root.handleChange('/list/c', { val: 3 }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                tsmatchers_1.assert("Value events not sent yet", value, tsmatchers_1.is.falsey);
                root.receivedQueryDone({ q: '1a' });
                tsmatchers_1.assert("Value events sent correctly", value, tsmatchers_1.is.strictly.object.matching({ a: tsmatchers_1.is.object, b: tsmatchers_1.is.object, c: tsmatchers_1.is.object }));
            });
            it('Should notify query of child_changed from nested', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                var rems = [];
                var chng = [];
                ref.on('child_removed', function (data) { return rems.push(data); });
                ref.on('child_changed', function (data) { return chng.push(data); });
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received no initial child_changed", chng, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/list/a/val', 5, dummyProg++, '1a');
                tsmatchers_1.assert("Received first child_changed", chng, tsmatchers_1.is.array.withLength(1));
                for (var i = 0; i < chng.length; i++) {
                    tsmatchers_1.assert("Received changed snapshots does not expose url meta-path", chng[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleChange('/list/b', null, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(1));
                for (var i = 0; i < rems.length; i++) {
                    tsmatchers_1.assert("Received removed snapshots does not expose url meta-path", rems[i].ref().url.substr(0, 6), '/list/');
                }
            });
            it.skip('Should not create interference with two queries', function () {
                var baseref = root.getUrl('/list');
                var ref1 = baseref.orderByChild('val');
                var ref2 = baseref.orderByChild('val');
                ref1.getSubscription().id = '1a';
                ref2.getSubscription().id = '2a';
                var value1 = null;
                var value2 = null;
                ref1.on('value', function (data) { value1 = data.val(); });
                ref2.on('value', function (data) { value2 = data.val(); });
                var adds1 = [];
                var adds2 = [];
                ref1.on('child_added', function (data) { return adds1.push(data); });
                ref2.on('child_added', function (data) { return adds2.push(data); });
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_added", adds1, tsmatchers_1.is.array.withLength(3));
                for (var i = 0; i < adds1.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", adds1[i].ref().url.substr(0, 6), '/list/');
                }
                tsmatchers_1.assert("Value events not sent yet", value1, tsmatchers_1.is.falsey);
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } }, dummyProg++, '2a');
                tsmatchers_1.assert("Received child_added", adds2, tsmatchers_1.is.array.withLength(3));
                for (var i = 0; i < adds2.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", adds2[i].ref().url.substr(0, 6), '/list/');
                }
                tsmatchers_1.assert("Value events not sent yet", value2, tsmatchers_1.is.falsey);
                root.receivedQueryDone({ q: '1a' });
                tsmatchers_1.assert("Value events sent correctly", value1, tsmatchers_1.is.strictly.object.matching({ a: tsmatchers_1.is.object, b: tsmatchers_1.is.object, c: tsmatchers_1.is.object }));
                root.receivedQueryDone({ q: '2a' });
                tsmatchers_1.assert("Value events sent correctly", value2, tsmatchers_1.is.strictly.object.matching({ a: tsmatchers_1.is.object, b: tsmatchers_1.is.object, c: tsmatchers_1.is.object }));
                var rems1 = [];
                var chng1 = [];
                var rems2 = [];
                var chng2 = [];
                ref1.on('child_removed', function (data) { return rems1.push(data); });
                ref1.on('child_changed', function (data) { return chng1.push(data); });
                ref2.on('child_removed', function (data) { return rems2.push(data); });
                ref2.on('child_changed', function (data) { return chng2.push(data); });
                root.handleChange('/list', { a: { val: 3 }, b: { val: 4 }, $i: true }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_changed", chng1, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < chng1.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", chng1[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleChange('/list', { a: { val: 3 }, b: { val: 4 }, $i: true }, dummyProg++, '2a');
                tsmatchers_1.assert("Received child_changed", chng2, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < chng2.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", chng2[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleChange('/list', { b: { val: 4 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_removed", rems1, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < rems1.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", rems1[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleChange('/list', { b: { val: 4 } }, dummyProg++, '2a');
                tsmatchers_1.assert("Received child_removed", rems2, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < rems2.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", rems2[i].ref().url.substr(0, 6), '/list/');
                }
            });
        });
        describe('Filters >', function () {
            it('Should return only "valued" entries', function () {
                var ref = root.getUrl('/users');
                root.handleChange('/users', { u1: { name: 'sara' }, u2: { name: 'simone' } }, dummyProg++);
                ref = ref.orderByChild('name').equalTo('mario');
                ref.getSubscription().id = '1a';
                var adds = [];
                var vals = [];
                ref.on('child_added', function (data, prek) { adds.push(data); });
                ref.on('value', function (data, prek) { vals.push(data); });
                tsmatchers_1.assert("Should have sent no values", vals, tsmatchers_1.is.array.withLength(0));
                tsmatchers_1.assert("Should have sent no added", adds, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/users', { u3: { name: 'mario' }, $i: true }, dummyProg++, '1a');
                root.receivedQueryDone({ q: '1a' });
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Received value", vals, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Received right value", vals[0].child('u3').val(), tsmatchers_1.is.object.matching({ name: 'mario' }));
                adds = [];
                vals = [];
                ref.on('child_added', function (data, prek) { adds.push(data); });
                ref.on('value', function (data, prek) { vals.push(data); });
                tsmatchers_1.assert("Received child_added on new subscription", adds, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Received value on new subscription", vals, tsmatchers_1.is.array.withLength(1));
            });
        });
        describe('Sorting >', function () {
            it('Should notify query child_added sorted on first set', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                var adds = [];
                var preks = [];
                var items = [];
                ref.on('child_added', function (data, prek) { adds.push(data); preks.push(prek); items.push(data.key()); });
                root.handleChange('/list', { a: { val: 3 }, b: { val: 2 }, c: { val: 1 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                tsmatchers_1.assert("Keys are sorted", items, tsmatchers_1.is.array.equals(['c', 'b', 'a']));
                tsmatchers_1.assert("Pre keys are correct", preks, tsmatchers_1.is.array.equals([null, 'c', 'b']));
            });
            it('Should notify query child_changed (and child_moved) with new position', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                ref.on('child_added', function (data, prek) { });
                root.handleChange('/list', { a: { val: 1 }, b: { val: 3 }, c: { val: 5 } }, dummyProg++, '1a');
                var adds = [];
                var preks = [];
                var items = [];
                ref.on('child_changed', function (data, prek) { adds.push(data); preks.push(prek); items.push(data.key()); });
                root.handleChange('/list/c/val', 2, dummyProg++, '1a');
                tsmatchers_1.assert("Kys are sorted", items, tsmatchers_1.is.array.equals(['c']));
                tsmatchers_1.assert("Pre keys are correct at first round", preks, tsmatchers_1.is.array.equals(['a']));
                ref.off('child_changed');
                var preks = [];
                var items = [];
                ref.on('child_moved', function (data, prek) { adds.push(data); preks.push(prek); items.push(data.key()); });
                root.handleChange('/list/c/val', 5, dummyProg++, '1a');
                tsmatchers_1.assert("Kys are sorted", items, tsmatchers_1.is.array.equals(['c']));
                tsmatchers_1.assert("Pre keys are correct at second round", preks, tsmatchers_1.is.array.equals(['b']));
            });
            // TODO child_moved on child removal
            it('Should remove excess elements', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val').limitToFirst(3);
                ref.getSubscription().id = '1a';
                var adds = [];
                ref.on('child_added', function (data, prek) { adds.push(data); });
                var rems = [];
                ref.on('child_removed', function (data, prek) { rems.push(data); });
                root.handleChange('/list', { a: { val: 5 }, b: { val: 6 }, c: { val: 7 } }, dummyProg++, '1a');
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                adds = [];
                root.handleChange('/list/d', { val: 1 }, dummyProg++, '1a');
                tsmatchers_1.assert("Received new child_added", adds, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Removed the last element", rems[0].key(), 'c');
                root.handleChange('/list/d/val', 7, dummyProg++, '1a');
                adds = [];
                rems = [];
                root.handleChange('/list', { x: { val: 1 }, y: { val: 2 }, $i: true }, dummyProg++, '1a');
                tsmatchers_1.assert("Received new child_added", adds, tsmatchers_1.is.array.withLength(2));
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(2));
                tsmatchers_1.assert("Removed the last element", rems[0].key(), 'b');
                tsmatchers_1.assert("Removed the last element", rems[1].key(), 'd');
            });
        });
    });
    describe('Writing >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        it('Should update data locally', function () {
            var ref = root.getUrl('/list');
            var valds;
            ref.on('value', function (ds) { return valds = ds; });
            tsmatchers_1.assert('No value sent yet', valds, tsmatchers_1.is.undefined);
            ref.set({ a: 1, b: 2 });
            tsmatchers_1.assert('Value set after first set', valds, tsmatchers_1.is.object);
            tsmatchers_1.assert('Value correct after first set', valds.val(), tsmatchers_1.is.object.matching({ a: 1, b: 2 }));
            valds = null;
            ref.set({ c: 3, d: 4 });
            tsmatchers_1.assert('Value set after second set', valds, tsmatchers_1.is.object);
            tsmatchers_1.assert('Value correct after second set', valds.val(), tsmatchers_1.is.strictly.object.matching({ c: 3, d: 4 }));
            valds = null;
            ref.update({ d: 6, e: 7 });
            tsmatchers_1.assert('Value set after update', valds, tsmatchers_1.is.object);
            tsmatchers_1.assert('Value correct after update', valds.val(), tsmatchers_1.is.strictly.object.matching({ c: 3, d: 6, e: 7 }));
            valds = null;
            ref.remove();
            tsmatchers_1.assert('Value event sent after delete', valds, tsmatchers_1.is.truthy);
            tsmatchers_1.assert('Value set after delete', valds, tsmatchers_1.is.object);
            tsmatchers_1.assert('Value correct after delete', valds.exists(), false);
        });
    });
    describe('Operating on root >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        it('Should write and erase on root', function () {
            var tr = root.getUrl('/');
            var list = tr.child('list');
            var listval;
            var trval;
            var listcb = list.on('value', function (ds) { listval = ds; });
            var trcb = tr.on('value', function (ds) { trval = ds; });
            var val = { list: { a: 1, b: 2 }, other: { c: 3, d: 4 } };
            var check = JSON.parse(JSON.stringify(val));
            tr.set(val);
            tsmatchers_1.assert("Root value set", trval.val(), tsmatchers_1.is.object.matching(check));
            tsmatchers_1.assert("List value set", listval.val(), tsmatchers_1.is.object.matching(check.list));
            tr.set(null);
            tsmatchers_1.assert("Root value unset", trval.val(), null);
            // TODO this is about propagating nullification to children
            //assert("List value unset", listval.val(), null);
            tr.off('value', trcb);
            trval = null;
            tr.set({ a: 1 });
            tsmatchers_1.assert("Root value unchanged", trval, null);
        });
    });
    function checkEvents(conn, events, anyOrder) {
        if (anyOrder === void 0) { anyOrder = false; }
        var ret = [];
        var cbs = {};
        var inerror = false;
        var cp = new Promise(function (res, err) {
            var evtIds = {
                sp: true,
                up: true,
                sq: true,
                uq: true,
                s: true,
                m: true
            };
            var acevt = 0;
            var _loop_1 = function(k) {
                cb = function (obj) {
                    try {
                        ret.push({ event: k, match: obj, answer: null });
                        tsmatchers_1.assert("Got too many events", events, tsmatchers_1.is.not.array.withLength(0));
                        if (anyOrder) {
                            var found = false;
                            var match = null;
                            for (var i = 0; i < events.length; i++) {
                                var acevobj = events[i];
                                if (acevobj.event != k)
                                    continue;
                                match = tsMatchers_1.matcherOrEquals(acevobj.match);
                                if (match.matches(obj)) {
                                    events.splice(i, 1);
                                    found = true;
                                    if (acevobj.answer) {
                                        conn.emit.apply(conn, acevobj.answer);
                                    }
                                    break;
                                }
                            }
                            if (!found) {
                                tsmatchers_1.assert("There is a matching event", obj, match);
                            }
                        }
                        else {
                            var acevobj = events.shift();
                            tsmatchers_1.assert("Checking event " + (acevt++) + " of type " + acevobj.event, obj, acevobj.match);
                            if (acevobj.answer) {
                                conn.emit.apply(conn, acevobj.answer);
                            }
                        }
                        if (events.length == 0)
                            res(ret);
                    }
                    catch (e) {
                        console.log("Received events", ret);
                        inerror = true;
                        err(e);
                    }
                };
                conn.on(k, cb);
                cbs[k] = cb;
            };
            var cb;
            for (var k in evtIds) {
                _loop_1(k);
            }
        });
        cp.stop = function () {
            for (var k in cbs) {
                conn.removeListener(k, cbs[k]);
            }
            tsmatchers_1.assert("Previous error while checking events", inerror, false);
        };
        return cp;
    }
    describe('E2E >', function () {
        var sockserver;
        var ssock;
        var csock;
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
            var socketOptions = {
                transports: ['websocket'],
                'force new connection': true
            };
            csock = SocketIOClient.connect('http://0.0.0.0:5000', socketOptions);
            root = new Client.RDb3Root(csock, 'http://ciao/');
            root.whenReady().then(function () {
                done();
            });
            sockserver.on('connection', function (sock) {
                if (!ssock)
                    ssock = sock;
                sock.emit('aa');
            });
        });
        it('Should not send immediate sp-up pairs', function () {
            var ref = root.getUrl('/users/u1');
            var cep = checkEvents(ssock, [
                {
                    event: 'sp',
                    match: '/users/u1',
                    answer: ['v', { p: '/users/u1', v: { name: 'Simone', surname: 'Gianni' } }]
                }
            ]);
            ref.on('value', function (ds) { });
            return cep.then(function () {
                // TODO wait for the value event to actually arrive
                return wait(500);
            }).then(function () {
                var sub = root.getUrl('/users/u1/name');
                return new Promise(function (res) {
                    sub.once('value', function (ds) { res(ds); });
                });
            }).then(function (ds) {
                tsmatchers_1.assert("Returned right value", ds.val(), 'Simone');
                cep.stop();
            });
        });
        it('Should not send immediate up-sp pairs', function () {
            var ref = root.getUrl('/users/u1');
            var cep = checkEvents(ssock, [
                {
                    event: 'sp',
                    match: '/users/u1',
                    answer: ['v', { p: '/users/u1', v: { name: 'Simone', surname: 'Gianni' } }]
                }
            ]);
            var cb = ref.on('value', function (ds) { });
            return cep.then(function () {
                // TODO wait for the value event to actually arrive
                return wait(500);
            }).then(function () {
                // Unsubscribe
                ref.off('value', cb);
                cb = ref.on('value', function (ds) { });
                return wait(500);
            }).then(function () {
                cep.stop();
                cep = checkEvents(ssock, [
                    {
                        event: 'up',
                        match: '/users/u1'
                    }
                ]);
                ref.off('value', cb);
                return cep;
            }).then(function () {
                return wait(500);
            }).then(function () {
                cep.stop();
            });
        });
    });
    describe('Performance >', function () {
        it('PF1 Parsing performance without listeners', function () {
            this.timeout(35000);
            var bigdata = {};
            for (var i = 0; i < 100; i++) {
                var usdata = {
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
                .add("simple parsing", function () {
                inc++;
                root = new Client.RDb3Root(null, 'http://ciao/');
                root.handleChange('/users', bigdata, 4);
            })
                .on('complete', function () {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.012773601477272726  dev: 0.001411317392724511");
                console.log("CNG : " + (stats.mean - 0.012773601477272726) + " : " + (stats.mean / 0.012773601477272726));
                console.log("Inc : " + inc);
            })
                .run();
            var data = root.getValue('/users');
            tsmatchers_1.assert("Value is right", data, tsmatchers_1.is.object.matching(bigdata));
        });
        it('PF2 Parsing performance with child listeners', function () {
            this.timeout(35000);
            var bigdata = {};
            for (var i = 0; i < 100; i++) {
                var usdata = {
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
                .add("parsing with events", function () {
                inc++;
                root = new Client.RDb3Root(null, 'http://ciao/');
                var ref = root.getUrl('/users');
                ref.on('value', function () { });
                ref.on('child_added', function () { });
                root.handleChange('/users', bigdata, 4);
            })
                .on('complete', function () {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.014293066598591544  dev: 0.00205628694474153");
                console.log("CNG : " + (stats.mean - 0.014293066598591544) + " : " + (stats.mean / 0.014293066598591544));
                console.log("Inc : " + inc);
            })
                .run();
            var data = root.getValue('/users');
            tsmatchers_1.assert("Value is right", data, tsmatchers_1.is.object.matching(bigdata));
        });
        it('PF3 Parsing performance with real child listeners', function () {
            this.timeout(35000);
            var bigdata = {};
            for (var i = 0; i < 100; i++) {
                var usdata = {
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
                .add("parsing with events", function () {
                inc++;
                root = new Client.RDb3Root(null, 'http://ciao/');
                var ref = root.getUrl('/users');
                ref.on('value', function (ds) { ds.val(); });
                ref.on('child_added', function (ds) { ds.val(); });
                root.handleChange('/users', bigdata, 4);
            })
                .on('complete', function () {
                var stats = this[0].stats;
                console.log("ACT : " + stats.mean + "  dev: " + stats.deviation);
                console.log("WAS : 0.008502651874755384  dev: 0.0005244241768842533");
                console.log("CNG : " + (stats.mean - 0.008502651874755384) + " : " + (stats.mean / 0.008502651874755384));
                console.log("Inc : " + inc);
            })
                .run();
            var data = root.getValue('/users');
            tsmatchers_1.assert("Value is right", data, tsmatchers_1.is.object.matching(bigdata));
        });
    });
});
function lazyExtend(prev, next) {
    if (!prev)
        return;
    for (var k in next) {
        var val = next[k];
        if (typeof (val) !== 'object')
            continue;
        lazyExtend(prev[k], val);
    }
    if (!next.toJSON)
        next.toJSON = jsonAll;
    Object.setPrototypeOf(next, prev);
}
function jsonAll() {
    var tmp = {};
    for (var key in this) {
        var to = typeof this[key];
        if (to !== 'function')
            tmp[key] = this[key];
    }
    return tmp;
}
function wait(to) {
    return new Promise(function (res, rej) {
        setTimeout(function () { return res(null); }, to);
    });
}

//# sourceMappingURL=ClientTests.js.map
