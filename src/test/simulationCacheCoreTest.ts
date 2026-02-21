// src/test/simulationCacheCore.test.ts
import * as assert from 'assert';
import { SimulationCacheCore } from '../services/simulationCacheCore';

(function run() {
  console.log('\n[simulationCacheCore.test]');

  // ttl + hit/miss
  {
    const cache = new SimulationCacheCore<{ ok: boolean }>({ enabled: true, ttlMs: 1000, maxEntries: 10 });
    const k = 'a';
    assert.strictEqual(cache.get(k, 0), undefined);
    cache.set(k, { ok: true }, 0);
    assert.deepStrictEqual(cache.get(k, 10), { ok: true });
    assert.strictEqual(cache.get(k, 2000), undefined);
  }

  // eviction
  {
    const cache = new SimulationCacheCore<number>({ enabled: true, ttlMs: 100000, maxEntries: 2 });
    cache.set('k1', 1, 0);
    cache.set('k2', 2, 0);
    cache.set('k3', 3, 0);
    assert.strictEqual(cache.size(), 2);
    assert.strictEqual(cache.get('k1', 1), undefined); // evicted
    assert.strictEqual(cache.get('k2', 1), 2);
    assert.strictEqual(cache.get('k3', 1), 3);
  }

  // invalidateWhere
  {
    const cache = new SimulationCacheCore<number>({ enabled: true, ttlMs: 100000, maxEntries: 10 });
    cache.set('x:1', 1, 0);
    cache.set('y:1', 2, 0);
    const removed = cache.invalidateWhere(k => k.startsWith('x'));
    assert.strictEqual(removed, 1);
    assert.strictEqual(cache.get('x:1', 1), undefined);
    assert.strictEqual(cache.get('y:1', 1), 2);
  }

  console.log('  ✓ ttl / hit-miss / eviction / invalidateWhere');
  console.log('  [ok] simulationCacheCore tests passed');
})();