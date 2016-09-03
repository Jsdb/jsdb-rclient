/**
 * TSDB remote client 20160903_171129_master_1.0.0_02a6940
 */
import { Spi } from 'jsdb';
export interface Socket {
    on(event: string, cb: (...args: any[]) => any): any;
    emit(event: string, ...args: any[]): any;
}
export declare class RDb3Root implements Spi.DbTreeRoot {
    private sock;
    private baseUrl;
    static VERSION: string;
    constructor(sock: Socket, baseUrl: string);
    private subscriptions;
    private data;
    private queries;
    private doneProm;
    getUrl(url: string): RDb3Tree;
    makeRelative(url: string): string;
    makeAbsolute(url: string): string;
    isReady(): boolean;
    whenReady(): Promise<any>;
    receivedValue(msg: any): void;
    receivedQueryDone(msg: any): void;
    receivedQueryExit(msg: any): void;
    send(...args: any[]): void;
    sendSubscribe(path: string): void;
    sendUnsubscribe(path: string): void;
    sendSubscribeQuery(def: QuerySubscription): void;
    sendUnsubscribeQuery(id: string): void;
    subscribe(path: string): Subscription;
    unsubscribe(path: string): void;
    subscribeQuery(query: QuerySubscription): void;
    unsubscribeQuery(id: string): void;
    getValue(url: string | string[]): any;
    handleChange(path: string, val: any): void;
    handleQueryChange(id: string, path: string, val: any): void;
    recurseApplyBroadcast(newval: any, acval: any, parentval: any, path: string, queryPath?: string): boolean;
    broadcastValue(path: string, val: any, queryPath: string): void;
    broadcastChildAdded(path: string, child: string, val: any, queryPath: string, prevChildName?: string): void;
    broadcastChildChanged(path: string, child: string, val: any, queryPath: string, prevChildName?: string): void;
    broadcastChildMoved(path: string, child: string, val: any, queryPath: string, prevChildName?: string): void;
    broadcastChildRemoved(path: string, child: string, val: any, queryPath: string): void;
    broadcast(path: string, type: string, snapProvider: () => RDb3Snap, prevChildName?: string): void;
    static create(conf: any): RDb3Root;
}
export declare class Subscription {
    root: RDb3Root;
    path: string;
    constructor(root: RDb3Root, path: string);
    cbs: Handler[];
    add(cb: Handler): void;
    remove(cb: Handler): void;
    subscribe(): void;
    unsubscribe(): void;
    findByType(evtype: string): Handler[];
}
export declare abstract class Handler {
    callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void;
    context: Object;
    tree: RDb3Tree;
    eventType: string;
    constructor(callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, context: Object, tree: RDb3Tree);
    matches(eventType?: string, callback?: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, context?: Object): boolean;
    hook(): void;
    decommission(): void;
    protected getValue(): any;
    abstract init(): void;
}
export declare class RDb3Snap implements Spi.DbTreeSnap {
    private data;
    private root;
    private url;
    constructor(data: any, root: RDb3Root, url: string, reclone?: boolean);
    exists(): boolean;
    val(): any;
    child(childPath: string): RDb3Snap;
    forEach(childAction: (childSnapshot: RDb3Snap) => void): boolean;
    key(): string;
    ref(): RDb3Tree;
}
export declare class RDb3Tree implements Spi.DbTree, Spi.DbTreeQuery {
    root: RDb3Root;
    url: string;
    constructor(root: RDb3Root, url: string);
    private cbs;
    private qsub;
    getSubscription(): Subscription;
    on(eventType: string, callback: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, cancelCallback?: (error: any) => void, context?: Object): (dataSnapshot: RDb3Snap, prevChildName?: string) => void;
    off(eventType?: string, callback?: (dataSnapshot: RDb3Snap, prevChildName?: string) => void, context?: Object): void;
    once(eventType: string, successCallback: (dataSnapshot: RDb3Snap) => void, context?: Object): void;
    private subQuery();
    /**
    * Generates a new Query object ordered by the specified child key.
    */
    orderByChild(key: string): RDb3Tree;
    /**
    * Generates a new Query object ordered by key name.
    */
    orderByKey(): RDb3Tree;
    /**
    * Creates a Query with the specified starting point.
    * The generated Query includes children which match the specified starting point.
    */
    startAt(value: string | number, key?: string): RDb3Tree;
    /**
    * Creates a Query with the specified ending point.
    * The generated Query includes children which match the specified ending point.
    */
    endAt(value: string | number, key?: string): RDb3Tree;
    /**
    * Creates a Query which includes children which match the specified value.
    */
    equalTo(value: string | number, key?: string): RDb3Tree;
    /**
    * Generates a new Query object limited to the first certain number of children.
    */
    limitToFirst(limit: number): RDb3Tree;
    /**
    * Generates a new Query object limited to the last certain number of children.
    */
    limitToLast(limit: number): RDb3Tree;
    /**
    * Gets the absolute URL corresponding to this DbTree reference's location.
    */
    toString(): string;
    /**
    * Writes data to this DbTree location.
    */
    set(value: any, onComplete?: (error: any) => void): void;
    /**
    * Writes the enumerated children to this DbTree location.
    */
    update(value: any, onComplete?: (error: any) => void): void;
    /**
    * Removes the data at this DbTree location.
    */
    remove(onComplete?: (error: any) => void): void;
    child(path: string): RDb3Tree;
}
export declare class QuerySubscription extends Subscription {
    id: string;
    compareField: string;
    from: string | number;
    to: string | number;
    equals: string | number;
    limit: number;
    limitLast: boolean;
    constructor(oth: Subscription | QuerySubscription);
    add(cb: Handler): void;
    remove(cb: Handler): void;
    subscribe(): void;
    unsubscribe(): void;
    makeSorter(): (a: any, b: any) => number;
}
