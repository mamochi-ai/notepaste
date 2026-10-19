import { genres, themes, seasons, weathers } from './genres.js';
import { characters } from './characters.js';
import { places } from './places.js';
import { motifs } from './motifs.js';
import { interludes } from './interludes.js';
import shopLastDay from './skeletons/shop_last_day.js';
import lostItem from './skeletons/lost_item.js';
import futureMessage from './skeletons/future_message.js';
import unmappedPlace from './skeletons/unmapped_place.js';
import extraCount from './skeletons/extra_count.js';

export const DATA = {
  genres,
  themes,
  seasons,
  weathers,
  characters,
  places,
  motifs,
  interludes,
  skeletons: [shopLastDay, lostItem, futureMessage, unmappedPlace, extraCount],
};
