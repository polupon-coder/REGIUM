// Reglamento dentro del juego: se genera a partir de docs/REGLAMENTO.md (única fuente de verdad).
import { Fragment, type ReactNode } from 'react';
import mdEs from '../../docs/REGLAMENTO.md?raw';
import mdEn from '../../docs/RULES.md?raw';
import { EN } from './i18n';

const md = EN ? mdEn : mdEs;

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part.startsWith('*') && part.length > 2 ? <i key={i}>{part.slice(1, -1)}</i> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Rules() {
  const lines = md.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('# ')) {
      i++;
      continue; // el título ya está en el panel
    }
    if (l.startsWith('### ')) out.push(<h4 key={i}>{inline(l.slice(4))}</h4>);
    else if (l.startsWith('## ')) out.push(<h3 key={i}>{inline(l.slice(3))}</h3>);
    else if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <table key={i}>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>{r.map((c, j) => (k === 0 ? <th key={j}>{inline(c)}</th> : <td key={j}>{inline(c)}</td>))}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    } else if (/^\s*(-|\d+\.) /.test(l)) {
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*(-|\d+\.) /.test(lines[i])) {
        const m = lines[i].match(/^(\s*)(?:-|\d+\.) (.*)$/)!;
        let text = m[2];
        while (i + 1 < lines.length && /^\s{2,}[^-\s\d]/.test(lines[i + 1]) && !/^\s*(-|\d+\.) /.test(lines[i + 1])) text += ' ' + lines[++i].trim();
        items.push({ depth: m[1].length >= 2 ? 1 : 0, text });
        i++;
      }
      out.push(
        <ul key={i}>
          {items.map((it, k) => (
            <li key={k} className={it.depth ? 'sub' : ''}>
              {inline(it.text)}
            </li>
          ))}
        </ul>,
      );
      continue;
    } else if (l.trim()) {
      let text = l;
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\||\s*-|\s*\d+\.)/.test(lines[i + 1])) text += ' ' + lines[++i];
      out.push(<p key={i}>{inline(text)}</p>);
    }
    i++;
  }
  return <div className="rules">{out}</div>;
}
