import { FileDiff } from '@pierre/diffs';

(window as typeof window & { reconcileDbPierre?: { fileDiff: typeof FileDiff } }).reconcileDbPierre = {
    fileDiff: FileDiff
};
