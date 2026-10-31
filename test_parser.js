const fs = require('fs');

function parseMarkdown(md) {
  const questions = [];
  const lines = md.split('\n');
  let currentGroup = 'General';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^## /.test(line)) {
      currentGroup = line.replace(/^## /, '').replace(/[🔴🔵🟢🟡🟣🟠]/g, '').trim();
      i++; continue;
    }

    const qMatch = line.match(/^\*\*Q(\d+)\.\s+\[(L[123])\]\s+(.*?)\*\*\s*$/);
    if (qMatch) {
      const num = parseInt(qMatch[1]);
      let note = '';
      let answerLines = [];

      i++;
      while (i < lines.length && lines[i].trim() === '') i++;
      if (i < lines.length && lines[i].startsWith('> *What the interviewer')) {
        note = lines[i].replace(/^> \*/, '').replace(/\*$/, '').trim();
        i++;
      }
      while (i < lines.length && lines[i].trim() === '') i++;

      if (i < lines.length && lines[i].match(/^\*\*Answer:\*\*\s*(.*)/)) {
        const firstAnswerLine = lines[i].match(/^\*\*Answer:\*\*\s*(.*)/)[1];
        if (firstAnswerLine.trim()) answerLines.push(firstAnswerLine);
        i++;
        while (i < lines.length) {
          if (/^\*\*Q\d+\./.test(lines[i]) || /^## /.test(lines[i]) || /^---/.test(lines[i])) break;
          answerLines.push(lines[i]);
          i++;
        }
      }

      while (answerLines.length && answerLines[answerLines.length - 1].trim() === '') answerLines.pop();

      questions.push({ num, answer: answerLines.join('\n') });
      continue;
    }
    
    // rapid-fire block...
    const rfMatch = line.match(/^\*\*(Q(\d+)\.\s+\[(L[123])\])\*\*\s+(.*?)\s+\*\*Answer:\*\*\s+(.*)/);
    if (rfMatch) {
      questions.push({ num: parseInt(rfMatch[2]), answer: rfMatch[5].trim() });
      i++; continue;
    }

    i++;
  }
  return questions;
}

const domains = ['kubernetes', 'aws', 'ci-cd', 'docker', 'terraform', 'linux-sre', 'observability', 'networking', 'security', 'general-devops', 'git', 'ai-engineering'];
for (const d of domains) {
  const md = fs.readFileSync(`docs/${d}/scenarios.md`, 'utf8');
  const qs = parseMarkdown(md);
  const empty = qs.filter(q => !q.answer.trim());
  if (empty.length > 0) {
    console.log(`${d} has ${empty.length} empty answers: ${empty.map(q=>q.num).join(', ')}`);
  }
}
