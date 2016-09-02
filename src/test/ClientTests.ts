import * as Client from '../main/Client';
import * as SocketIO from 'socket.io';
import * as SocketIOClient from 'socket.io-client';

import {assert, is} from 'tsmatchers';

interface TestDb3Root {
    data: any;
}

var root: Client.RDb3Root & TestDb3Root;

describe('RDb3Client >', () => {
    describe('Local data >', () => {

        beforeEach(function () {
            root = <any>new Client.RDb3Root(null, 'http://ciao/');
        });

        describe('Reading >', () => {
            it('Should not find root non existing data', () => {
                assert("Should return undefined", root.getValue('/node'), is.undefined);
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
                root.handleChange('/node', 'ciao');
                assert("Should return string", root.data['node'], 'ciao');
            });
            it('Should write sub primitive', () => {
                root.handleChange('/node/sub', 'ciao');
                assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write sub primitive with alternative url', () => {
                root.handleChange('node/sub/', 'ciao');
                assert("Should return string", root.data['node']['sub'], 'ciao');
            });
            it('Should write object', () => {
                root.handleChange('/node', { sub1: 'ciao', sub2: 'altro' });
                assert("Should return plain object", root.data['node'], is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should merge subs', () => {
                root.handleChange('/node', { sub1: 'ciao' });
                root.handleChange('/node/sub2', 'altro');
                assert("Should return merged object", root.data['node'], is.object.matching({
                    sub1: 'ciao',
                    sub2: 'altro'
                }));
            });
            it('Should overwrite subs', () => {
                root.handleChange('/node/sub2', 'altro');
                root.handleChange('/node', { sub1: 'ciao' });
                assert("Should return merged object", root.data['node']['sub2'], is.undefined);
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
            it('.val return value is unmodifiable', () => {
                var snap = new Client.RDb3Snap({ sub: { val: 'ciao' }, oth: 1 }, root, '/test/node');
                var val = snap.val();
                val.sub.val = 'pippo';
                var val2 = snap.val();
                assert('Should return object', snap.val(), is.strictly.object.matching({ sub: { val: 'ciao' }, oth: 1 }));
            });

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
                root.handleChange('/node/data', 'ciao');

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');

                snap = null;
                ref.off('value', fn, ctx);
                root.handleChange('/node/data', 'ciao2');
                assert("Should not receive another event", snap, is.falsey);
            });

            it('Should send a value event for already existing data', () => {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                var fn = ref.on('value', (data) => snap = data);

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should send a value event with once', () => {
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                ref.once('value', (data) => snap = data);
                root.handleChange('/node/data', 'ciao');

                assert("Received event", snap, is.truthy);
                assert("Recevied event data", snap.val(), 'ciao');

                snap = null;
                root.handleChange('/node/data', 'ciao2');
                assert("Should not receive another event", snap, is.falsey);
            });

            it('Should send a value event for outer change', () => {
                var ref = root.getUrl('/node/data');
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                root.handleChange('/node', { pippo: 'puppo', data: 'ciao' });

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should send a value event for inner additions', () => {
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                root.handleChange('/node/data', 'ciao');

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.val(), is.strictly.object.matching({ data: 'ciao' }));
            });

            it('Should send a value event for inner changes', () => {
                var ref = root.getUrl('/node');
                root.handleChange('/node/data', 'bau');
                var snap: Client.RDb3Snap;
                ref.on('value', (data) => snap = data);
                root.handleChange('/node/data', 'ciao');

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.val(), is.strictly.object.matching({ data: 'ciao' }));
            });

        });

        describe('Child diff events >', () => {
            it('Should send one child_added from empty', () => {
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_added', (data) => {
                    snap = data;
                });
                root.handleChange('/node/data', 'ciao');

                assert("Received event", snap, is.truthy);
                assert("Snapshot is existing", snap.exists(), true);
                assert("Recevied event data", snap.key(), 'data');
                assert("Recevied event data", snap.val(), 'ciao');
            });

            it('Should send multiple child_added from empty', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('child_added', (data) => snaps.push(data));
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });

                assert("Received events", snaps, is.array.withLength(2));
            });

            it('Should not send child_added for existing', () => {
                var ref = root.getUrl('/node');
                var snaps: Client.RDb3Snap[] = [];
                ref.on('child_added', (data) => snaps.push(data));
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });

                assert("Received events", snaps, is.array.withLength(2));

                snaps = [];
                root.handleChange('/node', { data1: 'ciao', data2: 'riciao' });
                assert("Received events", snaps, is.array.withLength(0));
            });

            it('Should send initial child_added from existing', () => {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_added', (data) => snap = data);

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should send child_removed on explict parent replace', () => {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_removed', (data) => snap = data);

                root.handleChange('/node', { data2: 'ciao' });

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should send child_removed on partial update', () => {
                root.handleChange('/node/data', 'ciao');
                var ref = root.getUrl('/node');
                var snap: Client.RDb3Snap;
                ref.on('child_removed', (data) => snap = data);

                root.handleChange('/node', { data: null, $i: true });

                assert("Received event", snap, is.truthy);
                assert("Snapshot exists", snap.exists(), true);
                assert("Recevied event data", snap.val(), 'ciao');
                assert("Recevied event data", snap.key(), 'data');
            });

            it('Should combine child added, removed and value', () => {
                root.handleChange('/list', { a: 1, b: 2, c: 3, d: 4 });

                var ref = root.getUrl('/list');
                var adds: Client.RDb3Snap[] = [];
                var rems: Client.RDb3Snap[] = [];

                ref.on('child_added', (data) => adds.push(data));
                ref.on('child_removed', (data) => rems.push(data));

                assert("Received initial child_addeds", adds, is.array.withLength(4));
                assert("Received no initial child_removed", rems, is.array.withLength(0));

                adds = [];

                root.handleChange('/list', { a: 1, c: 3, e: 5, f: 6 });

                assert("Received new child_addeds", adds, is.array.withLength(2));
                assert("Received new child_removed", rems, is.array.withLength(2));
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
                root.handleChange('/list', { a: 1, b: 2, c: 3 });

                var ref = root.getUrl('/list');
                var movs: Client.RDb3Snap[] = [];

                ref.on('child_changed', (data) => movs.push(data));

                assert("Received no initial child_changed", movs, is.array.withLength(0));

                root.handleChange('/list', { b: 2, a: 1, c: 4 });

                assert("Received new child_changed", movs, is.array.withLength(1));
            });

            it('Should send child_changed for deep change', () => {
                root.handleChange('/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } });

                var ref = root.getUrl('/list');
                var movs: Client.RDb3Snap[] = [];

                ref.on('child_changed', (data) => movs.push(data));

                assert("Received no initial child_changed", movs, is.array.withLength(0));

                root.handleChange('/list', { b: { val: 2 }, a: { val: 1 }, c: { val: 4 } });

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

                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 }, $l :true });

                assert("Received child_added", adds, is.array.withLength(3));
                for (var i = 0; i < adds.length; i++) {
                    assert("Received snapshots does not expose url meta-path", adds[i].ref().url.substr(0,6), '/list/');
                }

                assert("Value events not sent yet", value, is.falsey);

                root.handleQueryChange('1a', '/list', { $i :true, $d :true });

                assert("Value events sent correctly", value, is.strictly.object.matching({a:is.object, b:is.object, c:is.object}));

                var rems: Client.RDb3Snap[] = [];
                var chng: Client.RDb3Snap[] = [];
                ref.on('child_removed', (data) => rems.push(data));
                ref.on('child_changed', (data) => chng.push(data));

                root.handleQueryChange('1a', '/list', { a: { val: 3 }, b: { val: 4 }, $i:true });

                assert("Received child_changed", chng, is.array.withLength(2));
                for (var i = 0; i < chng.length; i++) {
                    assert("Received snapshots does not expose url meta-path", chng[i].ref().url.substr(0,6), '/list/');
                }

                root.handleQueryChange('1a', '/list', { b: { val: 4 } });
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


                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 2 }, c: { val: 3 } });

                assert("Received child_changed", chng, is.array.withLength(0));

                root.handleQueryChange('1a', '/list/a/val', 5);

                assert("Received child_changed", chng, is.array.withLength(1));
                for (var i = 0; i < chng.length; i++) {
                    assert("Received changed snapshots does not expose url meta-path", chng[i].ref().url.substr(0,6), '/list/');
                }

                root.handleQueryChange('1a', '/list/b', null);
                assert("Received child_removed", rems, is.array.withLength(1));
                for (var i = 0; i < rems.length; i++) {
                    assert("Received removed snapshots does not expose url meta-path", rems[i].ref().url.substr(0,6), '/list/');
                }
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

                root.handleQueryChange('1a', '/list', { a: { val: 3 }, b: { val: 2 }, c: { val: 1 } });

                assert("Received child_added", adds, is.array.withLength(3));
                assert("Kys are sorted", items, is.array.equals(['c','b','a']));
                assert("Pre keys are correct", preks, is.array.equals([null,'c','b']));
            });

            it('Should notify query child_changed (and child_moved) with new position', ()=>{
                var ref = root.getUrl('/list');
                ref = ref.orderByChild('val');
                (<Client.QuerySubscription>ref.getSubscription()).id = '1a';

                ref.on('child_added', (data,prek) => {});

                root.handleQueryChange('1a', '/list', { a: { val: 1 }, b: { val: 3 }, c: { val: 5 } });

                var adds :Client.RDb3Snap[] = [];
                var preks :string[] = []; 
                var items :string[] = [];
                ref.on('child_changed', (data,prek) => {adds.push(data);preks.push(prek);items.push(data.key())});

                root.handleQueryChange('1a', '/list/c/val', 2);

                assert("Kys are sorted", items, is.array.equals(['c']));
                assert("Pre keys are correct", preks, is.array.equals(['a']));

                ref.off('child_changed');

                var preks :string[] = []; 
                var items :string[] = [];
                ref.on('child_moved', (data,prek) => {adds.push(data);preks.push(prek);items.push(data.key())});

                root.handleQueryChange('1a', '/list/c/val', 5);

                assert("Kys are sorted", items, is.array.equals(['c']));
                assert("Pre keys are correct", preks, is.array.equals(['b']));
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

                root.handleQueryChange('1a', '/list', { a: { val: 5 }, b: { val: 6 }, c: { val: 7 } });

                assert("Received child_added", adds, is.array.withLength(3));

                adds=[];

                root.handleQueryChange('1a', '/list/d/val', 1);

                assert("Received new child_added", adds, is.array.withLength(1));
                assert("Received child_removed", rems, is.array.withLength(1));
                assert("Removed the last element", rems[0].key(), 'c');

                root.handleQueryChange('1a', '/list/d/val', 7);
                adds = [];
                rems = [];
                root.handleQueryChange('1a', '/list', { x:{val:1}, y:{val:2}, $i:true});

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
            assert('Value set after delete', valds, is.object);
            assert('Value correct after delete', valds.exists(), false);
       });
    });

    describe('E2E >', ()=>{
        var ssock :SocketIO.Server;
        var csock :SocketIOClient.Socket;
        beforeEach(function (done) {
            if (ssock) ssock.close();
            ssock = SocketIO.listen(5000);
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
            root.whenReady().then(()=>done());
        });

        
    });
});