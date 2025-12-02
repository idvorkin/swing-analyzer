describe('Pose Studio Page', () => {
  beforeEach(() => {
    cy.clearPoseTracks();
    cy.visit('/poses');
  });

  it('loads the Pose Studio page', () => {
    cy.contains('Pose Studio').should('be.visible');
    cy.contains('Extract, manage, and test pose data').should('be.visible');
  });

  it('displays the Extract Poses card', () => {
    cy.contains('Extract Poses').should('be.visible');
    cy.get('.drop-zone').should('exist');
    cy.contains('Click to select video').should('be.visible');
  });

  it('displays the Preview card', () => {
    cy.contains('Preview').should('be.visible');
    cy.contains('No pose track').should('be.visible');
  });

  it('shows empty state for saved pose tracks when none exist', () => {
    cy.contains('Saved Pose Tracks').should('be.visible');
    cy.contains('0 files').should('be.visible');
    cy.contains('No saved pose tracks yet').should('be.visible');
  });

  it('has navigation links', () => {
    cy.get('.pose-studio-nav').within(() => {
      cy.contains('Analyzer').should('have.attr', 'href', '/');
      cy.contains('Pose Studio').should('have.attr', 'href', '/poses');
      cy.contains('Debug').should('have.attr', 'href', '/debug');
    });
  });

  it('navigates to main analyzer', () => {
    cy.contains('Analyzer').click();
    cy.url().should('eq', `${Cypress.config().baseUrl}/`);
    cy.contains('h1', 'Swing Analyzer').should('be.visible');
  });

  it('has model selector', () => {
    // PoseModelSelector should be present
    cy.get('.pose-model-selector, select').should('exist');
  });

  it('has Extract Poses button (initially disabled without video)', () => {
    cy.contains('button', 'Extract Poses').should('be.disabled');
  });
});
