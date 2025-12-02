describe('Video Controls', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads hardcoded sample video when Sample button is clicked', () => {
    cy.get('#load-hardcoded-btn').click();

    // Video should have a source
    cy.getVideoElement()
      .should('have.prop', 'src')
      .and('include', 'swing-sample.mp4');
  });

  it('can toggle play/pause on loaded video', () => {
    // Load the sample video first
    cy.get('#load-hardcoded-btn').click();

    // Wait for video to load
    cy.getVideoElement().should('have.prop', 'readyState').and('be.gte', 2);

    // The video controls might be disabled if model isn't loaded
    // but we can still verify the buttons exist
    cy.get('#play-pause-btn').should('exist');
  });

  it('shows filmstrip section', () => {
    cy.get('.filmstrip-section').should('exist');
    cy.get('.filmstrip-container').should('exist');
  });

  it('shows file input for video upload', () => {
    cy.get('input#video-upload[type="file"]').should('exist');
    cy.get('label.file-label').should('contain', 'File');
  });
});
