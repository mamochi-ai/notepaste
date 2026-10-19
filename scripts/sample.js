// 1編だけ生成して表示する: node scripts/sample.js [歩数] [シード] [ジャンル]
import { generateStory } from '../src/engine/generator.js';
import { checkStory, metrics } from '../src/engine/analyze.js';
import { DATA } from '../src/data/index.js';

const [steps = '5000', seed = 'sample', genre] = process.argv.slice(2);
const story = generateStory({ steps: Number(steps), seed, genre });
console.log(story.text);
console.log(`--- ${story.charCount}字 / ${story.meta.tempo.label}`);
console.log(JSON.stringify({ ...story.meta, beats: undefined }, null, 0));
console.log(metrics(story));
console.log(checkStory(story, DATA));
