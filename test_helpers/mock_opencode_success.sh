#!/usr/bin/env bash
# Mock opencode with JSON format output
echo '{"type":"step_start","timestamp":1234567890,"sessionID":"test_session","part":{"id":"prt_test","sessionID":"test_session","messageID":"msg_test","type":"step-start","snapshot":"abc123"}}'
echo '{"type":"text","timestamp":1234567891,"sessionID":"test_session","part":{"id":"prt_test2","sessionID":"test_session","messageID":"msg_test","type":"text","text":"Mock opencode output","time":{"start":1234567891,"end":1234567891}}}'
echo '{"type":"step_finish","timestamp":1234567892,"sessionID":"test_session","part":{"id":"prt_test3","sessionID":"test_session","messageID":"msg_test","type":"step-finish","reason":"stop","snapshot":"abc123","cost":0,"tokens":{"input":100,"output":10,"reasoning":0,"cache":{"read":0,"write":0}}}}'
exit 0
