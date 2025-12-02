describe('Pose Track Fixture Loading', () => {
  beforeEach(() => {
    cy.clearPoseTracks();
  });

  it('can load a pose track fixture into IndexedDB', () => {
    // Load the fixture
    cy.loadPoseTrackFixture();

    // Visit pose studio and verify the track appears
    cy.visit('/poses');

    // Should show 1 file instead of 0
    cy.contains('1 files').should('be.visible');

    // Should show the video name from the fixture
    cy.contains('swing-sample.mp4').should('be.visible');
  });

  it('displays pose track metadata correctly', () => {
    cy.loadPoseTrackFixture();
    cy.visit('/poses');

    // Check the file card shows correct info
    cy.get('.file-card').within(() => {
      cy.contains('swing-sample.mp4').should('be.visible');
      cy.contains('Lightning').should('be.visible'); // movenet-lightning
      cy.contains('30 frames').should('be.visible');
      cy.contains('10.0s').should('be.visible');
    });
  });

  it('can test (analyze) a saved pose track', () => {
    cy.loadPoseTrackFixture();
    cy.visit('/poses');

    // Click the Test button
    cy.contains('button', 'Test').click();

    // Should show an alert with analysis results
    cy.on('window:alert', (text) => {
      expect(text).to.include('Analysis Results');
      expect(text).to.include('Total Frames');
    });
  });

  it('can delete a saved pose track', () => {
    cy.loadPoseTrackFixture();
    cy.visit('/poses');

    // Should show 1 file
    cy.contains('1 files').should('be.visible');

    // Click delete button (the trash icon button)
    cy.get('.btn-danger').click();

    // Confirm the deletion
    cy.on('window:confirm', () => true);

    // Should now show 0 files
    cy.contains('0 files').should('be.visible');
    cy.contains('No saved pose tracks yet').should('be.visible');
  });

  it('shows download button for saved pose tracks', () => {
    cy.loadPoseTrackFixture();
    cy.visit('/poses');

    // Find download button by its SVG path (download icon)
    cy.get('.file-card').within(() => {
      cy.get('button[title="Download"]').should('exist');
    });
  });

  it('clears pose tracks correctly', () => {
    // First load a fixture
    cy.loadPoseTrackFixture();
    cy.visit('/poses');
    cy.contains('1 files').should('be.visible');

    // Clear and reload
    cy.clearPoseTracks();
    cy.reload();

    // Should be empty
    cy.contains('0 files').should('be.visible');
  });
});
