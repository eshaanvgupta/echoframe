import {spawnSync} from 'node:child_process';
const order=['core','celo','x402','mpp','erc8183','node','react','cli','mcp'];
for(const name of order){
  const r=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p',`packages/${name}/tsconfig.json`],{stdio:'inherit'});
  if(r.status!==0)process.exit(r.status??1);
}
