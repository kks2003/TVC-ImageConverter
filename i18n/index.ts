import type { Language, Translation } from './types';
import hu from './hu';
import en from './en';
import pl from './pl';
import de from './de';
import ru from './ru';
import uk from './uk';
import es from './es';
import sk from './sk';
import ro from './ro';

export type { Language, Translation } from './types';

export const translations: Record<Language, Translation> = { hu, en, pl, de, ru, uk, es, sk, ro };
