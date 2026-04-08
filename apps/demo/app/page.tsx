/**
 * The fake product UI the demo uses to dogfood pip.
 *
 * This is deliberately dense enough that pip has interesting things to
 * point at: a sidebar with nav, a "New project" button in the header, a
 * filter row above a list of project cards, and an empty-state card at the
 * bottom for fun. Real content lives in `pip.md` so the LLM knows what
 * each of these things do.
 */

type ProjectStatus = 'active' | 'draft' | 'archived';

interface Project {
  id: string;
  name: string;
  summary: string;
  status: ProjectStatus;
}

const PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Spring onboarding redesign',
    summary: 'Rework the first-run tour for new teammates',
    status: 'active',
  },
  {
    id: 'p2',
    name: 'Billing migration',
    summary: 'Move legacy invoices off the old pipeline',
    status: 'active',
  },
  {
    id: 'p3',
    name: 'Q2 marketing site refresh',
    summary: 'New hero + refreshed case studies',
    status: 'draft',
  },
  {
    id: 'p4',
    name: 'Mobile app ideas board',
    summary: 'Collecting feedback from iOS beta users',
    status: 'archived',
  },
];

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

export default function Home() {
  return (
    <div className="shell">
      <aside className="sidebar" data-testid="sidebar">
        <h1>
          <span className="logo-dot" />
          Acme Projects
        </h1>
        <nav aria-label="Main navigation">
          <a href="#" className="active">Projects</a>
          <a href="#">Teammates</a>
          <a href="#">Billing</a>
          <a href="#">Settings</a>
        </nav>
      </aside>

      <main className="main">
        <header className="main-header">
          <div>
            <h2>Your projects</h2>
            <p>
              {PROJECTS.length} project{PROJECTS.length === 1 ? '' : 's'} ·{' '}
              {PROJECTS.filter((p) => p.status === 'active').length} active
            </p>
          </div>
          <button
            type="button"
            className="btn"
            data-testid="new-project-btn"
            aria-label="Create a new project"
          >
            + New project
          </button>
        </header>

        <div className="filters" aria-label="Project filters">
          <button type="button" className="filter-chip active">All</button>
          <button type="button" className="filter-chip">Active</button>
          <button type="button" className="filter-chip">Draft</button>
          <button type="button" className="filter-chip">Archived</button>
        </div>

        <section className="projects" aria-label="Project list">
          {PROJECTS.map((project) => (
            <article
              key={project.id}
              className="project"
              data-testid={`project-${project.id}`}
            >
              <div className="project-info">
                <h3>{project.name}</h3>
                <p>{project.summary}</p>
              </div>
              <span className={`badge badge-${project.status}`}>
                {STATUS_LABEL[project.status]}
              </span>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
