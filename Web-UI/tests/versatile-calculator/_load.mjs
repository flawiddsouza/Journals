// Parser tests import the shared parser module directly (single source of truth).
import * as P from '../../src/components/PageTypes/VersatileCalculator/parser.js';

export { P };
if (!P.parseLine) throw new Error('parser module did not export parseLine');
