#!/usr/bin/env bash
set -u
OUT=/opt/cursor/artifacts/test-runner-bench
BUN=${BUN_BIN:-/home/ubuntu/.bun/bin/bun}

run() {
	node bench/sample-run.mjs "$@"
}

echo "=== node runs 2-3 ==="
for i in 2 3; do
	run --label node --run "$i" --out "$OUT/node-$i.json" --log "$OUT/node-$i.log" --parser node -- \
		node --import ./bench/node/register.mjs --test --test-reporter spec \
		$(find src packages workers scripts -name '*.test.ts' | sort)
done

echo "=== bun fine interval ==="
for i in 0 1 2 3; do
	run --label bun --run "$i" --interval 20 --out "$OUT/bun-$i.json" --log "$OUT/bun-$i.log" --parser bun -- \
		"$BUN" test --preload ./bench/bun/preload.ts
done

echo "=== scale23 forks ==="
for i in 0 1 2 3; do
	run --label scale23-forks --run "$i" --out "$OUT/scale23-forks-$i.json" --log "$OUT/scale23-forks-$i.log" --parser vitest -- \
		yarn vitest run --config vite.config.ts --maxWorkers=23 --pool=forks
done

echo "=== recommended ==="
for i in 0 1 2 3; do
	run --label recommended --run "$i" --out "$OUT/recommended-$i.json" --log "$OUT/recommended-$i.log" --parser vitest -- \
		yarn vitest run --config bench/vitest.recommended.config.ts
done

echo REST_DONE
