"use strict";
var Client = require('../main/Client');
var SocketIO = require('socket.io');
var SocketIOClient = require('socket.io-client');
var tsmatchers_1 = require('tsmatchers');
var root;
describe('RDb3Client >', function () {
    describe('Local data >', function () {
        beforeEach(function () {
            root = new Client.RDb3Root(null, 'http://ciao/');
        });
        describe('Reading >', function () {
            it('Should not find root non existing data', function () {
                tsmatchers_1.assert("Should return undefined", root.getValue('/node'), tsmatchers_1.is.undefined);
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
                root.handleChange('/node', 'ciao');
                tsmatchers_1.assert("Should return string", root.data['node'], 'ciao');
            });
            it('Should write sub primitive', function () {
                root.handleChange('/node/sub', 'ciao');
                tsmatchers_1.assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write sub primitive with alternative url', function () {
                root.handleChange('node/sub/', 'ciao');
                tsmatchers_1.assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write object', function () {
                root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' });
                tsmatchers_1.assert("Should return plain object", root.data['node'], tsmatchers_1.is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should merge subs', function () {
                root.handleChange('/node', { sub1: 'ciao' });
                root.handleChange('/node/sub2', 'altro');
                tsmatchers_1.assert("Should return merged object", root.data['node'], tsmatchers_1.is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should overwrite subs', function () {
                root.handleChange('/node/sub2', 'altro');
                root.handleChange('/node', { sub1: 'ciao' });
                tsmatchers_1.assert("Should return merged object", root.data['node']['sub2'], tsmatchers_1.is.undefined);
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
            it('.val return value is unmodifiable', function () {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var val = snap.val();
                val.sub.val = 'pippo';
                var val2 = snap.val();
                tsmatchers_1.assert('Should return object', snap.val(), tsmatchers_1.is.strictly.object.matching({ sub: { val: 'ciao' }, oth: 1 }));
            });
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
                root.handleChange('/node/data', 'ciao');
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                snap = null;
                ref.off('value', fn, ctx);
                root.handleChange('/node/data', 'ciao2');
                tsmatchers_1.assert("Should not receive another event", snap, tsmatchers_1.is.falsey);
            });
            it('Should send a value event for already existing data', function () {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node/data');
                var snap;
                var fn = ref.on('value', function (data) { return snap = data; });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should send a value event with once', function () {
                var ref = root.getUrl('/node/data');
                var snap;
                ref.once('value', function (data) { return snap = data; });
                root.handleChange('/node/data', 'ciao');
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                snap = null;
                root.handleChange('/node/data', 'ciao2');
                tsmatchers_1.assert("Should not receive another event", snap, tsmatchers_1.is.falsey);
            });
            it('Should send a value event for outer change', function () {
                var ref = root.getUrl('/node/data');
                var snap;
                ref.on('value', function (data) { return snap = data; });
                root.handleChange('/node', { pippo: 'puppo', data: 'ciao' });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should send a value event for inner additions', function () {
                var ref = root.getUrl('/node');
                var snap;
                ref.on('value', function (data) { return snap = data; });
                root.handleChange('/node/data', 'ciao');
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.strictly.object.matching({ data: 'ciao' }));
            });
            it('Should send a value event for inner changes', function () {
                var ref = root.getUrl('/node');
                root.handleChange('/node/data', 'bau');
                var snap;
                ref.on('value', function (data) { return snap = data; });
                root.handleChange('/node/data', 'ciao');
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), tsmatchers_1.is.strictly.object.matching({ data: 'ciao' }));
            });
        });
        describe('Child diff events >', function () {
            it('Should send one child_added from empty', function () {
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_added', function (data) {
                    snap = data;
                });
                root.handleChange('/node/data', 'ciao');
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot is existing", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
            });
            it('Should send multiple child_added from empty', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('child_added', function (data) { return snaps.push(data); });
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(2));
            });
            it('Should not send child_added for existing', function () {
                var ref = root.getUrl('/node');
                var snaps = [];
                ref.on('child_added', function (data) { return snaps.push(data); });
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(2));
                snaps = [];
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });
                tsmatchers_1.assert("Received events", snaps, tsmatchers_1.is.array.withLength(0));
            });
            it('Should send initial child_added from existing', function () {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_added', function (data) { return snap = data; });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should send child_removed on explict parent replace', function () {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_removed', function (data) { return snap = data; });
                root.handleChange('/node', { data2: 'ciao' });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should send child_removed on partial update', function () {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap;
                ref.on('child_removed', function (data) { return snap = data; });
                root.handleChange('/node', { data: null, $i: true });
                tsmatchers_1.assert("Received event", snap, tsmatchers_1.is.truthy);
                tsmatchers_1.assert("Snapshot exists", snap.exists(), true);
                tsmatchers_1.assert("Recevied event data", snap.val(), 'ciao');
                tsmatchers_1.assert("Recevied event data", snap.key(), 'data');
            });
            it('Should combine child added, removed and value', function () {
                root.handleChange('/list', { a: 1, b: 2, c: 3, d: 4 });
                var ref = root.getUrl('/list');
                var adds = [];
                var rems = [];
                ref.on('child_added', function (data) { return adds.push(data); });
                ref.on('child_removed', function (data) { return rems.push(data); });
                tsmatchers_1.assert("Received initial child_addeds", adds, tsmatchers_1.is.array.withLength(4));
                tsmatchers_1.assert("Received no initial child_removed", rems, tsmatchers_1.is.array.withLength(0));
                adds = [];
                root.handleChange('/list', { a: 1, c: 3, e: 5, f: 6 });
                tsmatchers_1.assert("Received new child_addeds", adds, tsmatchers_1.is.array.withLength(2));
                tsmatchers_1.assert("Received new child_removed", rems, tsmatchers_1.is.array.withLength(2));
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
                root.handleChange('/list', { a: 1, b: 2, c: 3 });
                var ref = root.getUrl('/list');
                var movs = [];
                ref.on('child_changed', function (data) { return movs.push(data); });
                tsmatchers_1.assert("Received no initial child_changed", movs, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/list', { b: 2, a: 1, c: 4 });
                tsmatchers_1.assert("Received new child_changed", movs, tsmatchers_1.is.array.withLength(1));
            });
            it('Should send child_changed for deep change', function () {
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } });
                var ref = root.getUrl('/list');
                var movs = [];
                ref.on('child_changed', function (data) { return movs.push(data); });
                tsmatchers_1.assert("Received no initial child_changed", movs, tsmatchers_1.is.array.withLength(0));
                root.handleChange('/list', { b: { val: 2 }, a: { val: 1 }, c: { val: 4 } });
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
                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 }, $l: true });
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                for (var i = 0; i < adds.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", adds[i].ref().url.substr(0, 6), '/list/');
                }
                tsmatchers_1.assert("Value events not sent yet", value, tsmatchers_1.is.falsey);
                root.handleQueryChange('1a', '/list', { $i: true, $d: true });
                tsmatchers_1.assert("Value events sent correctly", value, tsmatchers_1.is.strictly.object.matching({ a: tsmatchers_1.is.object, b: tsmatchers_1.is.object, c: tsmatchers_1.is.object }));
                var rems = [];
                var chng = [];
                ref.on('child_removed', function (data) { return rems.push(data); });
                ref.on('child_changed', function (data) { return chng.push(data); });
                root.handleQueryChange('1a', '/list', { a: { val: 3 }, b: { val: 4 }, $i: true });
                tsmatchers_1.assert("Received child_changed", chng, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < chng.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", chng[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleQueryChange('1a', '/list', { b: { val: 4 } });
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(2));
                for (var i = 0; i < rems.length; i++) {
                    tsmatchers_1.assert("Received snapshots does not expose url meta-path", rems[i].ref().url.substr(0, 6), '/list/');
                }
            });
            it('Should notify query of child_changed from nested', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                var rems = [];
                var chng = [];
                ref.on('child_removed', function (data) { return rems.push(data); });
                ref.on('child_changed', function (data) { return chng.push(data); });
                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } });
                tsmatchers_1.assert("Received child_changed", chng, tsmatchers_1.is.array.withLength(0));
                root.handleQueryChange('1a', '/list/a/val', 5);
                tsmatchers_1.assert("Received child_changed", chng, tsmatchers_1.is.array.withLength(1));
                for (var i = 0; i < chng.length; i++) {
                    tsmatchers_1.assert("Received changed snapshots does not expose url meta-path", chng[i].ref().url.substr(0, 6), '/list/');
                }
                root.handleQueryChange('1a', '/list/b', null);
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(1));
                for (var i = 0; i < rems.length; i++) {
                    tsmatchers_1.assert("Received removed snapshots does not expose url meta-path", rems[i].ref().url.substr(0, 6), '/list/');
                }
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
                root.handleQueryChange('1a', '/list', { a: { val: 3 }, b: { val: 2 }, c: { val: 1 } });
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                tsmatchers_1.assert("Kys are sorted", items, tsmatchers_1.is.array.equals(['c', 'b', 'a']));
                tsmatchers_1.assert("Pre keys are correct", preks, tsmatchers_1.is.array.equals([null, 'c', 'b']));
            });
            it('Should notify query child_changed (and child_moved) with new position', function () {
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                ref.getSubscription().id = '1a';
                ref.on('child_added', function (data, prek) { });
                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 3 }, c: { val: 5 } });
                var adds = [];
                var preks = [];
                var items = [];
                ref.on('child_changed', function (data, prek) { adds.push(data); preks.push(prek); items.push(data.key()); });
                root.handleQueryChange('1a', '/list/c/val', 2);
                tsmatchers_1.assert("Kys are sorted", items, tsmatchers_1.is.array.equals(['c']));
                tsmatchers_1.assert("Pre keys are correct", preks, tsmatchers_1.is.array.equals(['a']));
                ref.off('child_changed');
                var preks = [];
                var items = [];
                ref.on('child_moved', function (data, prek) { adds.push(data); preks.push(prek); items.push(data.key()); });
                root.handleQueryChange('1a', '/list/c/val', 5);
                tsmatchers_1.assert("Kys are sorted", items, tsmatchers_1.is.array.equals(['c']));
                tsmatchers_1.assert("Pre keys are correct", preks, tsmatchers_1.is.array.equals(['b']));
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
                root.handleQueryChange('1a', '/list', { a: { val: 5 }, b: { val: 6 }, c: { val: 7 } });
                tsmatchers_1.assert("Received child_added", adds, tsmatchers_1.is.array.withLength(3));
                adds = [];
                root.handleQueryChange('1a', '/list/d/val', 1);
                tsmatchers_1.assert("Received new child_added", adds, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Received child_removed", rems, tsmatchers_1.is.array.withLength(1));
                tsmatchers_1.assert("Removed the last element", rems[0].key(), 'c');
                root.handleQueryChange('1a', '/list/d/val', 7);
                adds = [];
                rems = [];
                root.handleQueryChange('1a', '/list', { x: { val: 1 }, y: { val: 2 }, $i: true });
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
            tsmatchers_1.assert('Value set after delete', valds, tsmatchers_1.is.object);
            tsmatchers_1.assert('Value correct after delete', valds.exists(), false);
        });
    });
    describe('E2E >', function () {
        var ssock;
        var csock;
        beforeEach(function (done) {
            if (ssock)
                ssock.close();
            ssock = SocketIO.listen(5000);
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
            root.whenReady().then(function () { return done(); });
        });
    });
});

//# sourceMappingURL=ClientTests.js.map
