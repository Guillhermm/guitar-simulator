export const CREDIT_TEXT = 'Made by Guilherme Almeida Zeni with AI agents.';

export const CREDIT_LINKS = [
  { text: 'LinkedIn', href: 'https://www.linkedin.com/in/guilherme-zeni/', label: 'Guilherme on LinkedIn, opens in a new tab' },
  { text: 'GitHub', href: 'https://github.com/Guillhermm/guitar-simulator', label: 'Source code on GitHub, opens in a new tab' },
  { text: 'Profile', href: 'https://guilherme.zenus.systems', label: 'Guilherme’s profile website, opens in a new tab' },
];

// Fixed strings only; the node is filled with createElement and textContent, never markup.
export const buildCredit = (container, doc = document) => {
  const sentence = doc.createElement('span');
  sentence.textContent = CREDIT_TEXT;
  const links = doc.createElement('span');
  links.className = 'credit-links';
  CREDIT_LINKS.forEach(({ text, href, label }, i) => {
    if (i > 0) links.append(' · ');
    const a = doc.createElement('a');
    a.href = href;
    a.textContent = text;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label);
    links.append(a);
  });
  container.replaceChildren(sentence, ' ', links);
};
