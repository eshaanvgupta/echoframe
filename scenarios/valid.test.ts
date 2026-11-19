// Deterministic SIMULATION. No real-world exploit claim.
import {describe,it,expect} from 'vitest';
import {runScenario,fixAndRerun} from '@echoframe/core';
describe('ECHOFRAME '+"valid",()=>{
  it('reproduces and fixes the same seed',()=>{
    const before=runScenario("valid",42220,'vulnerable');
    const after=fixAndRerun(before);
    expect(after.seed).toBe(before.seed);
    expect(after.invariants.find(i=>i.id==="requireOutcome")?.satisfied).toBe(true);
    expect(after.assertions.failed).toBe(0);
    expect(runScenario("valid",42220,'honest').resultHash).toBe(after.resultHash);
  });
});
