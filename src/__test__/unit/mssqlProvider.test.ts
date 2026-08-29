import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as mssql from 'mssql';

import { QueryResultRow } from '../../utils/types';
import { streamMssqlRequest } from '../../utils/database/mssqlProvider';

class FakeStreamingRequest extends EventEmitter {
    stream = false;
    pauseCount = 0;
    resumeCount = 0;
    cancelCount = 0;
    private nextRow = 0;

    constructor(private readonly rows: QueryResultRow[]) {
        super();
    }

    query(): Promise<unknown> {
        queueMicrotask(() => this.emitNext());
        return Promise.resolve();
    }

    pause(): boolean {
        this.pauseCount += 1;
        return true;
    }

    resume(): boolean {
        this.resumeCount += 1;
        queueMicrotask(() => this.emitNext());
        return true;
    }

    cancel(): void {
        this.cancelCount += 1;
    }

    private emitNext(): void {
        if (this.nextRow < this.rows.length) {
            this.emit('row', this.rows[this.nextRow]);
            this.nextRow += 1;
            return;
        }
        this.emit('done');
    }
}

suite('SQL Server row streaming', () => {
    test('yields rows incrementally with pause and resume backpressure', async () => {
        const request = new FakeStreamingRequest([{ id: 1 }, { id: 2 }, { id: 3 }]);
        const received: QueryResultRow[] = [];

        for await (const row of streamMssqlRequest(request as unknown as mssql.Request, 'SELECT * FROM test')) {
            received.push(row);
        }

        assert.deepEqual(received, [{ id: 1 }, { id: 2 }, { id: 3 }]);
        assert.equal(request.stream, true);
        assert.equal(request.pauseCount, 3);
        assert.equal(request.resumeCount, 3);
        assert.equal(request.cancelCount, 0);
    });
});
