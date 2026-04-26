export default function LocaleNotFound() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--page-bg)' }}
    >
      <h1 className="text-3xl font-semibold leading-tight" style={{ color: 'var(--text-heading)' }}>
        Page introuvable
      </h1>
      <h2 className="text-3xl font-semibold leading-tight mt-1" style={{ color: 'var(--text-heading)' }}>
        Page not found
      </h2>

      <p className="mt-6 max-w-md text-sm" style={{ color: 'var(--text-body)' }}>
        La page que vous cherchez n&apos;existe pas ou a été déplacée.
      </p>
      <p className="mt-1 max-w-md text-sm" style={{ color: 'var(--text-body)' }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <a
        href="/fr/dashboard"
        className="mt-8 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold no-underline"
        style={{ backgroundColor: 'var(--amber-400)', color: 'var(--navy-900)' }}
      >
        Retour au tableau de bord / Back to dashboard
      </a>
    </main>
  );
}
