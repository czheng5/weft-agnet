import { discoverToolchain, hasEdaTools } from '../src/core/tool-discovery.ts';

const report = discoverToolchain();
console.log('EDA/PDK DISCOVERY');
console.log('  tools=' + (report.tools.length > 0 ? report.tools.map((tool) => tool.name + '@' + tool.path).join(', ') : 'none'));
console.log('  pdks=' + (report.pdks.length > 0 ? report.pdks.join(', ') : 'none'));
console.log('  ready=' + hasEdaTools(report));
if (!hasEdaTools(report)) {
  console.log('  note=no hard blocker; rerun when toolchain/PDK is mounted or PATH changes');
}
