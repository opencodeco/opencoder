PREFIX ?= /usr/local
VERSION ?= 1.0.0

.PHONY: all dev test test-coverage test-coverage-report test-coverage-check lint format clean install build-linux-x64 build-darwin-arm64 build-windows build-all

all:
	bun build --compile --minify --sourcemap \
		--define VERSION='"$(VERSION)"' \
		src/index.ts --outfile opencoder

dev:
	bun run src/index.ts

test:
	bun test

test-coverage:
	bun test --coverage

test-coverage-report:
	bun test --coverage --coverage-reporter=lcov

test-coverage-check:
	@echo "Generating coverage report..."
	@bun test --coverage --coverage-reporter=text 2>&1 | grep -A 100 "File" || true
	@echo ""
	@echo "Coverage analysis complete. Check the coverage/ directory for detailed reports."

lint:
	bunx biome check src/ tests/

lint-fix:
	bunx biome check --write src/ tests/

format:
	bunx biome format --write src/ tests/

clean:
	rm -rf opencoder opencoder-* opencoder.exe node_modules bun.lockb coverage/

install: all
	install -d $(PREFIX)/bin
	install -m 755 opencoder $(PREFIX)/bin/

# Cross-compilation targets
build-linux-x64:
	bun build --compile --minify --sourcemap --target=bun-linux-x64 \
		--define VERSION='"$(VERSION)"' \
		src/index.ts --outfile opencoder-linux-x64

build-darwin-arm64:
	bun build --compile --minify --sourcemap --target=bun-darwin-arm64 \
		--define VERSION='"$(VERSION)"' \
		src/index.ts --outfile opencoder-darwin-arm64

build-darwin-x64:
	bun build --compile --minify --sourcemap --target=bun-darwin-x64 \
		--define VERSION='"$(VERSION)"' \
		src/index.ts --outfile opencoder-darwin-x64

build-windows:
	bun build --compile --minify --sourcemap --target=bun-windows-x64 \
		--define VERSION='"$(VERSION)"' \
		src/index.ts --outfile opencoder.exe

build-all: all build-linux-x64 build-darwin-arm64 build-darwin-x64 build-windows
