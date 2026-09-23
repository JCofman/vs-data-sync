import assert from 'node:assert/strict';

import { formatJsonValue, suggestedFieldView } from '../../compare/fieldPresentation';

suite('Field presentation', () => {
    test('suggests JSON and HTML for string columns without changing their values', () => {
        assert.equal(suggestedFieldView([{ type: 'string', value: '  {"name":"Ada"}' }]), 'json');
        assert.equal(suggestedFieldView([{ type: 'string', value: '<div>Hello</div>' }]), 'html');
        assert.equal(suggestedFieldView([{ type: 'string', value: 'ordinary text' }]), undefined);
    });

    test('formats JSON values for display while preserving key order and scalar types', () => {
        assert.equal(formatJsonValue('{"b":2,"a":true}'), '{\n  "b": 2,\n  "a": true\n}');
        assert.throws(() => formatJsonValue('{invalid}'), SyntaxError);
    });
});
