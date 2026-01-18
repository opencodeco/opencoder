#!/usr/bin/env bash
# Mock opencode failure with JSON format output
echo '{"type":"error","timestamp":1234567890,"sessionID":"test_session","error":{"name":"APIError","data":{"message":"Mock opencode error","statusCode":500,"isRetryable":false}}}' >&2
exit 1
