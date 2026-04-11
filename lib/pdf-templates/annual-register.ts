import { baseLayoutHTML, escapeHtml } from './base-layout';

export interface AnnualRegisterData {
  companyName: string;
  neq?: string;
  fiscalYear: string;
  asOfDate: string;
  directors: {
    name: string;
    address: string;
    appointedDate: string;
    endDate?: string;
  }[];
  shareholders: {
    name: string;
    address: string;
    sharesClass: string;
    sharesCount: number;
    percentage: number;
  }[];
  officers: {
    name: string;
    title: string;
    appointedDate: string;
  }[];
  language: 'fr' | 'en' | 'bilingual';
}

const LABELS = {
  fr: {
    title: 'Registre annuel',
    subtitle: (fy: string) => `Exercice fiscal ${fy}`,
    directors: 'Administrateurs',
    shareholders: 'Actionnaires',
    officers: 'Dirigeants',
    name: 'Nom',
    address: 'Adresse',
    appointed: 'Nommé le',
    end: 'Fin',
    class: 'Catégorie',
    shares: 'Actions',
    pct: '%',
    titleCol: 'Titre',
    current: 'En poste',
  },
  en: {
    title: 'Annual Register',
    subtitle: (fy: string) => `Fiscal Year ${fy}`,
    directors: 'Directors',
    shareholders: 'Shareholders',
    officers: 'Officers',
    name: 'Name',
    address: 'Address',
    appointed: 'Appointed',
    end: 'End',
    class: 'Class',
    shares: 'Shares',
    pct: '%',
    titleCol: 'Title',
    current: 'Current',
  },
  bilingual: {
    title: 'Registre annuel / Annual Register',
    subtitle: (fy: string) => `Exercice / Fiscal Year ${fy}`,
    directors: 'Administrateurs / Directors',
    shareholders: 'Actionnaires / Shareholders',
    officers: 'Dirigeants / Officers',
    name: 'Nom / Name',
    address: 'Adresse / Address',
    appointed: 'Nommé / Appointed',
    end: 'Fin / End',
    class: 'Catégorie / Class',
    shares: 'Actions / Shares',
    pct: '%',
    titleCol: 'Titre / Title',
    current: 'En poste / Current',
  },
} as const;

export function annualRegisterHTML(data: AnnualRegisterData): string {
  const l = LABELS[data.language];

  const directorsTable = `
    <h2 style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;color:#070E1C;margin:1.5em 0 0.5em;">${l.directors}</h2>
    <table class="register">
      <thead><tr>
        <th>${l.name}</th><th>${l.address}</th><th>${l.appointed}</th><th>${l.end}</th>
      </tr></thead>
      <tbody>${data.directors
        .map(
          (d) =>
            `<tr><td>${escapeHtml(d.name)}</td><td>${escapeHtml(d.address)}</td><td>${escapeHtml(d.appointedDate)}</td><td>${d.endDate ? escapeHtml(d.endDate) : l.current}</td></tr>`
        )
        .join('')}</tbody>
    </table>`;

  const shareholdersTable = `
    <h2 style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;color:#070E1C;margin:1.5em 0 0.5em;">${l.shareholders}</h2>
    <table class="register">
      <thead><tr>
        <th>${l.name}</th><th>${l.address}</th><th>${l.class}</th><th>${l.shares}</th><th>${l.pct}</th>
      </tr></thead>
      <tbody>${data.shareholders
        .map(
          (s) =>
            `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.address)}</td><td>${escapeHtml(s.sharesClass)}</td><td>${s.sharesCount.toLocaleString()}</td><td>${s.percentage.toFixed(1)}%</td></tr>`
        )
        .join('')}</tbody>
    </table>`;

  const officersTable = `
    <h2 style="font-family:'Sora',sans-serif;font-weight:600;font-size:15px;color:#070E1C;margin:1.5em 0 0.5em;">${l.officers}</h2>
    <table class="register">
      <thead><tr>
        <th>${l.name}</th><th>${l.titleCol}</th><th>${l.appointed}</th>
      </tr></thead>
      <tbody>${data.officers
        .map(
          (o) =>
            `<tr><td>${escapeHtml(o.name)}</td><td>${escapeHtml(o.title)}</td><td>${escapeHtml(o.appointedDate)}</td></tr>`
        )
        .join('')}</tbody>
    </table>`;

  const bodyContent = `
    <p style="font-size:12px;color:#6B6560;margin-bottom:1em;">${data.language === 'en' ? 'As of' : 'En date du'} ${escapeHtml(data.asOfDate)}</p>
    ${directorsTable}
    ${shareholdersTable}
    ${officersTable}
  `;

  return baseLayoutHTML({
    companyName: data.companyName,
    neq: data.neq,
    documentTitle: l.title,
    documentSubtitle: l.subtitle(data.fiscalYear),
    bodyContent,
    footerDocName: l.title,
    language: data.language,
  });
}
