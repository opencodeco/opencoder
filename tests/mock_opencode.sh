#!/usr/bin/env bash
# Mock opencode script for testing

# Check for mode file first (for parallel test safety)
MODE_FILE="/tmp/mock_opencode_mode_$$"
if [ -f "$MODE_FILE" ]; then
    MODE=$(cat "$MODE_FILE")
    rm -f "$MODE_FILE"
else
    MODE="${MOCK_OPENCODE_MODE:-success}"
fi

case "$MODE" in
    success)
        echo "Mock opencode output"
        exit 0
        ;;
    failure)
        echo "Mock opencode error" >&2
        exit 1
        ;;
    signal)
        # Simulate being killed by signal
        kill -TERM $$
        ;;
    slow)
        sleep 2
        echo "Mock opencode output"
        exit 0
        ;;
    *)
        echo "Unknown mode: $MODE" >&2
        exit 1
        ;;
esac
