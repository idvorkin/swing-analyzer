describe('Swing Analyzer Main Page', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the application and displays the main UI elements', () => {
    // Header
    cy.contains('h1', 'Swing Analyzer').should('be.visible');

    // Top controls
    cy.get('#load-hardcoded-btn').should('be.visible').and('contain', 'Sample');
    cy.get('#camera-btn').should('be.visible').and('contain', 'Camera');
    cy.get('input[type="file"]#video-upload').should('exist');

    // Video container
    cy.get('.video-container').should('exist');
    cy.getVideoElement().should('exist');
    cy.getCanvasElement().should('exist');
  });

  it('displays video controls', () => {
    cy.get('#prev-frame-btn').should('exist');
    cy.get('#play-pause-btn').should('exist');
    cy.get('#next-frame-btn').should('exist');
    cy.get('#stop-btn').should('exist');
  });

  it('has settings button that opens settings modal', () => {
    cy.get('button[aria-label="Open settings"]').click();
    cy.contains('Settings').should('be.visible');
  });

  it('shows analysis section with rep count', () => {
    cy.get('.analysis-section').should('exist');
  });
});
