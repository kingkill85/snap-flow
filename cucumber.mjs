export default {
  paths: ['e2e/features/**/*.feature'],
  import: ['e2e/support/**/*.ts', 'e2e/steps/**/*.ts'],
  format: ['progress', 'json:e2e/results/cucumber-report.json',
    'html:e2e/results/cucumber-report.html'],
  formatOptions: { snippetInterface: 'async-await' },
  parallel: 0,
  retry: 0,
};
