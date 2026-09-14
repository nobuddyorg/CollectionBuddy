import { generateCoverageReport } from './coverage';

export default async function globalTeardown() {
  await generateCoverageReport();
}
