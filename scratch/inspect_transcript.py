import json

log_path = '/Users/notslimboy/.gemini/antigravity/brain/6a5fa3b7-d29c-47df-b807-59945308e6a8/.system_generated/logs/transcript.jsonl'

terms = ["Dina Tohir 9", "ITS T 85", "J 41", "Tohir 17", "Keputih Tgl"]

with open(log_path, 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        try:
            data = json.loads(line)
            content = data.get('content', '')
            # If content is a dict (like tool call args or output), convert to string
            if not isinstance(content, str):
                content = str(content)
            
            # check tool calls and other fields
            tc_str = str(data.get('tool_calls', ''))
            
            matched = []
            for term in terms:
                if term.lower() in content.lower() or term.lower() in tc_str.lower():
                    matched.append(term)
            
            if matched:
                print(f"Step {data.get('step_index', i)} | Source: {data.get('source')} | Type: {data.get('type')}")
                print(f"Matched terms: {matched}")
                # Print a slice of content
                print(content[:500] + ("..." if len(content) > 500 else ""))
                print("="*80)
        except Exception as e:
            pass
