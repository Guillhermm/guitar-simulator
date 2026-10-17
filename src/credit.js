import { ICONS } from './icons.js';

export const CREDIT_TEXT = 'Made by Guilherme Almeida Zeni with AI agents.';

// kind picks the mark: the two company marks are official artwork (see README, "Brand marks"), the
// profile link is our own icon from icons.js.
export const CREDIT_LINKS = [
  { key: 'linkedin', kind: 'linkedin', href: 'https://www.linkedin.com/in/guilherme-zeni/', label: 'Guilherme on LinkedIn, opens in a new tab', tip: 'LinkedIn' },
  { key: 'github', kind: 'github', href: 'https://github.com/Guillhermm/guitar-simulator', label: 'Source code on GitHub, opens in a new tab', tip: 'GitHub' },
  { key: 'profile', kind: 'profile', href: 'https://guilherme.zenus.systems', label: 'Guilherme’s profile website, opens in a new tab', tip: 'Profile' },
];

// The LinkedIn "in" bug, as downloaded from brand.linkedin.com/in-logo: the black file for a light
// theme and the white one for a dark theme. The download offers PNG only, so they are used as given.
export const LINKEDIN_MARKS = [
  { src: 'assets/linkedin/InBug-Black.png', theme: 'light' },
  { src: 'assets/linkedin/InBug-White.png', theme: 'dark' },
];
export const LINKEDIN_SIZE = { width: 840, height: 779 };

// The GitHub Invertocat, path data copied unchanged from GitHub_Invertocat_Black.svg in the
// GitHub_Logos.zip of brand.github.com/foundations/logo. The fill follows the theme (#000 or #fff).
export const GITHUB_MARK = {
  viewBox: '0 0 98 96',
  d: 'M41.4395 69.3848C28.8066 67.8535 19.9062 58.7617 19.9062 46.9902C19.9062 42.2051 21.6289 37.0371 24.5 33.5918C23.2559 30.4336 23.4473 23.7344 24.8828 20.959C28.7109 20.4805 33.8789 22.4902 36.9414 25.2656C40.5781 24.1172 44.4062 23.543 49.0957 23.543C53.7852 23.543 57.6133 24.1172 61.0586 25.1699C64.0254 22.4902 69.2891 20.4805 73.1172 20.959C74.457 23.543 74.6484 30.2422 73.4043 33.4961C76.4668 37.1328 78.0937 42.0137 78.0937 46.9902C78.0937 58.7617 69.1934 67.6621 56.3691 69.2891C59.623 71.3945 61.8242 75.9883 61.8242 81.252L61.8242 91.2051C61.8242 94.0762 64.2168 95.7031 67.0879 94.5547C84.4102 87.9512 98 70.6289 98 49.1914C98 22.1074 75.9883 6.69539e-07 48.9043 4.309e-07C21.8203 1.92261e-07 -1.9479e-07 22.1074 -4.3343e-07 49.1914C-6.20631e-07 70.4375 13.4941 88.0469 31.6777 94.6504C34.2617 95.6074 36.75 93.8848 36.75 91.3008L36.75 83.6445C35.4102 84.2188 33.6875 84.6016 32.1562 84.6016C25.8398 84.6016 22.1074 81.1563 19.4277 74.7441C18.375 72.1602 17.2266 70.6289 15.0254 70.3418C13.877 70.2461 13.4941 69.7676 13.4941 69.1934C13.4941 68.0449 15.4082 67.1836 17.3223 67.1836C20.0977 67.1836 22.4902 68.9063 24.9785 72.4473C26.8926 75.2227 28.9023 76.4668 31.2949 76.4668C33.6875 76.4668 35.2187 75.6055 37.4199 73.4043C39.0469 71.7773 40.291 70.3418 41.4395 69.3848Z',
};

const NS = 'http://www.w3.org/2000/svg';

const svgOf = (doc, viewBox, className) => {
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
};

const pathOf = (doc, d) => {
  const path = doc.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  return path;
};

export const buildCreditMark = (kind, doc = document) => {
  if (kind === 'linkedin') {
    return LINKEDIN_MARKS.map(({ src, theme }) => {
      const img = doc.createElement('img');
      img.className = `mark mark-linkedin on-${theme}`;
      img.src = src;
      img.alt = '';
      img.width = LINKEDIN_SIZE.width;
      img.height = LINKEDIN_SIZE.height;
      img.setAttribute('aria-hidden', 'true');
      return img;
    });
  }
  if (kind === 'github') {
    const svg = svgOf(doc, GITHUB_MARK.viewBox, 'mark mark-github');
    svg.append(pathOf(doc, GITHUB_MARK.d));
    return [svg];
  }
  if (kind === 'profile') {
    const svg = svgOf(doc, '0 0 24 24', 'mark mark-profile');
    ICONS.profile.forEach((d) => svg.append(pathOf(doc, d)));
    return [svg];
  }
  throw new Error(`Unknown credit mark: ${kind}`);
};

// Fixed strings only; the node is filled with createElement and textContent, never markup.
export const buildCredit = (container, doc = document) => {
  const sentence = doc.createElement('span');
  sentence.className = 'credit-sentence';
  sentence.textContent = CREDIT_TEXT;
  const icons = doc.createElement('span');
  icons.className = 'credit-icons';
  CREDIT_LINKS.forEach(({ key, kind, href, label, tip }) => {
    const a = doc.createElement('a');
    a.className = `ilink ilink-${key}`;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', label);
    a.setAttribute('data-tip', tip);
    a.append(...buildCreditMark(kind, doc));
    icons.append(a);
  });
  container.replaceChildren(sentence, icons);
};
