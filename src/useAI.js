async function callAI(prompt, maxTokens = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': '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',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await r.json();
  return d.content?.map(c => c.text || '').join('');
}