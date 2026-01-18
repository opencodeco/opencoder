.PHONY: lint lint-fix format clean postinstall

lint:
	bunx biome check src/

lint-fix:
	bunx biome check --write src/

format:
	bunx biome format --write src/

postinstall:
	node postinstall.mjs

clean:
	rm -rf node_modules bun.lockb
