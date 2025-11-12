import { start } from './spawnLoop.js';
import { startTimer } from './timer.js';
import { initTags } from './tagManager.js';
import { setTag } from './spawnLoop.js';

initTags(setTag);
startTimer();
start();
