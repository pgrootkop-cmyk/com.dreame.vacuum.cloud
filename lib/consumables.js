'use strict';

/**
 * Dreame consumable definitions and alert threshold logic.
 *
 * Dreame Home app fires alerts at 6% remaining life — this module
 * replicates that behaviour and provides per-consumable metadata
 * for enriched trigger tokens.
 */

/** Alert threshold matching the Dreame Home app */
const ALERT_THRESHOLD = 6;

/**
 * Consumable metadata.
 * key       → matches your existing capability name suffix
 * name.en   → human-readable string for trigger tokens
 */
const CONSUMABLES = [
  {
    key:        'main_brush',
    capability: 'consumable_main_brush',
    name: { en: 'Main brush',  nl: 'Hoofdborstel', de: 'Hauptbürste',  sv: 'Huvudborste',  fr: 'Brosse principale', es: 'Cepillo principal', no: 'Hovedbørste',  da: 'Hovedbørste'  },
  },
  {
    key:        'side_brush',
    capability: 'consumable_side_brush',
    name: { en: 'Side brush',  nl: 'Zijborstel',   de: 'Seitenbürste', sv: 'Sidborste',    fr: 'Brosse latérale',   es: 'Cepillo lateral',  no: 'Sidebørste',   da: 'Sidebørste'   },
  },
  {
    key:        'filter',
    capability: 'consumable_filter',
    name: { en: 'Filter',      nl: 'Filter',       de: 'Filter',       sv: 'Filter',       fr: 'Filtre',            es: 'Filtro',           no: 'Filter',       da: 'Filter'       },
  },
  {
    key:        'mop_pad',
    capability: 'consumable_mop_pad',
    name: { en: 'Mop pad',     nl: 'Dweildoek',    de: 'Wischpad',     sv: 'Moppplatta',   fr: 'Tampon serpillière', es: 'Almohadilla mopa', no: 'Moppepute',    da: 'Moppepude'    },
  },
  {
    key:        'sensor',
    capability: 'consumable_sensor',
    name: { en: 'Sensor',      nl: 'Sensor',       de: 'Sensor',       sv: 'Sensor',       fr: 'Capteur',           es: 'Sensor',           no: 'Sensor',       da: 'Sensor'       },
  },
];

/**
 * Find a consumable definition by its key.
 * @param {string} key
 * @returns {object|undefined}
 */
function findConsumable(key) {
  return CONSUMABLES.find(c => c.key === key);
}

module.exports = { CONSUMABLES, ALERT_THRESHOLD, findConsumable };
