import { appendFile } from 'node:fs/promises';

export async function publishSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
    return;
  }
  console.log(markdown);
}
