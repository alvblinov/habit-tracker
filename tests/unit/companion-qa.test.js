import { describe, it, expect } from 'vitest';
import {
  QA,
  QUICK_QUESTIONS,
  normalizeQuestion,
  findAnswer,
  getAnswerEntry,
  answerText,
  unknownAnswer,
  answerQuestion,
} from '../../src/companion-qa.js';
import { CHARACTERS } from '../../src/companion.js';

// Расширение итерации 006: «Спроси меня» — ответы без ИИ по ключевым словам (AC-50).

const IDS = CHARACTERS.map((c) => c.id);
const REPROACH = /пропуст|лентя|ленив|стыдн|позор|провал/i;

describe('normalizeQuestion', () => {
  it.each([
    ['Как ДОБАВИТЬ привычку???', 'как добавить привычку'],
    ['  Тёмная   ТЕМА!!! ', 'темная тема'],
    ['Ещё, ещё… и ЁЖИК', 'еще еще и ежик'],
    ['«Серия» — это что?', 'серия это что'],
    ['<b>жирный</b>', 'b жирный b'],
    ['21 день?', '21 день'],
  ])('«%s» → «%s» (нижний регистр, ё→е, без знаков, одиночные пробелы)', (raw, expected) => {
    expect(normalizeQuestion(raw)).toBe(expected);
  });

  it.each([[''], ['   '], ['?!…'], [null], [undefined], [42], [{}]])('пустое/не строка %s → пустая строка', (raw) => {
    expect(normalizeQuestion(raw)).toBe('');
  });
});

describe('QA — база ответов', () => {
  it('не меньше 40 записей, id уникальны', () => {
    expect(QA.length).toBeGreaterThanOrEqual(40);
    expect(new Set(QA.map((e) => e.id)).size).toBe(QA.length);
  });

  it('у каждой записи — непустые ключевые слова и непустой ответ без «{…}» и упрёков', () => {
    for (const entry of QA) {
      expect(Array.isArray(entry.keywords), entry.id).toBe(true);
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
      for (const k of entry.keywords) {
        expect(typeof k, entry.id).toBe('string');
        expect(normalizeQuestion(k).length, `${entry.id}: «${k}»`).toBeGreaterThan(0);
      }
      expect(typeof entry.answer, entry.id).toBe('string');
      expect(entry.answer.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.answer, entry.id).not.toMatch(/[{}]/);
      expect(entry.answer, entry.id).not.toMatch(REPROACH);
    }
  });

  it('есть ответы и про трекер, и советы по привычкам', () => {
    const ids = new Set(QA.map((e) => e.id));
    for (const id of ['add', 'delete', 'mark', 'past', 'streak', 'reminder', 'storage', 'tour']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ['start', 'motivation', 'missed', 'water', 'sleep']) expect(ids.has(id), id).toBe(true);
  });
});

describe('findAnswer — ключевые слова', () => {
  it.each([
    ['Как добавить привычку?', 'add'],
    ['как создать новую привычку', 'add'],
    ['КАК УДАЛИТЬ!!!', 'delete'],
    ['что такое серия', 'streak'],
    ['как отключить помощника', 'companion-off'],
    ['хочу пить больше воды', 'water'],
    ['забыл отметить вчера', 'past'],
    ['как настроить напоминание', 'reminder'],
    ['Где хранятся мои данные?', 'storage'],
    ['тёмная тема', 'theme'],
  ])('«%s» → %s', (question, id) => {
    expect(findAnswer(question)?.id).toBe(id);
  });

  it('регистр, знаки препинания и ё не важны: варианты одного вопроса дают один ответ', () => {
    const groups = [
      ['как добавить привычку', 'КАК ДОБАВИТЬ ПРИВЫЧКУ', 'Как, добавить — привычку?!', '  как   добавить привычку…'],
      ['темная тема', 'Тёмная тема', 'ТЁМНАЯ ТЕМА!!!', '«тёмная» тема?'],
      ['что такое серия', 'Что такое СЕРИЯ?', 'что-такое-серия'],
    ];
    for (const group of groups) {
      const expected = findAnswer(group[0]);
      expect(expected, group[0]).not.toBeNull();
      for (const q of group) expect(findAnswer(q), q).toBe(expected);
    }
  });

  it.each([['ёжик'], ['qwerty'], ['<b>x</b>'], [''], ['   '], ['???']])('незнакомый вопрос «%s» → null', (q) => {
    expect(findAnswer(q)).toBeNull();
  });
});

describe('быстрые вопросы', () => {
  it('6–8 кнопок, у каждой подпись и существующая запись QA', () => {
    expect(QUICK_QUESTIONS.length).toBeGreaterThanOrEqual(6);
    expect(QUICK_QUESTIONS.length).toBeLessThanOrEqual(8);
    expect(new Set(QUICK_QUESTIONS.map((q) => q.id)).size).toBe(QUICK_QUESTIONS.length);
    for (const q of QUICK_QUESTIONS) {
      expect(typeof q.label, q.id).toBe('string');
      expect(q.label.trim().length, q.id).toBeGreaterThan(0);
      expect(getAnswerEntry(q.id), q.id).not.toBeNull();
      expect(getAnswerEntry(q.id).id).toBe(q.id);
    }
  });

  it('getAnswerEntry: неизвестный id → null', () => {
    expect(getAnswerEntry('nope')).toBeNull();
    expect(getAnswerEntry(undefined)).toBeNull();
  });
});

describe('ответы в стиле персонажа', () => {
  it('у каждого персонажа ответ содержит текст записи, без «{…}» и упрёков — для всех записей', () => {
    for (const entry of QA) {
      for (const id of IDS) {
        const text = answerText(entry, id);
        expect(text, `${id}/${entry.id}`).toContain(entry.answer);
        expect(text, `${id}/${entry.id}`).not.toMatch(/[{}]/);
        expect(text, `${id}/${entry.id}`).not.toMatch(REPROACH);
      }
    }
  });

  it('ответы на один вопрос у разных персонажей различаются стилем', () => {
    const entry = getAnswerEntry('add');
    const texts = IDS.map((id) => answerText(entry, id));
    expect(new Set(texts).size).toBe(IDS.length);
  });

  it('неизвестный вопрос: честный ответ с подсказкой, о чём спросить; у каждого персонажа свой', () => {
    const texts = IDS.map((id) => unknownAnswer(id));
    for (let i = 0; i < IDS.length; i += 1) {
      expect(texts[i].trim().length, IDS[i]).toBeGreaterThan(0);
      expect(texts[i], IDS[i]).toMatch(/спроси/i);
      expect(texts[i], IDS[i]).not.toMatch(/[{}]/);
      expect(texts[i], IDS[i]).not.toMatch(REPROACH);
    }
    expect(new Set(texts).size).toBe(IDS.length);
  });

  it('answerQuestion: известный вопрос → { id записи, текст ответа }', () => {
    const result = answerQuestion('Как добавить привычку?', 'fox');
    expect(result.id).toBe('add');
    expect(result.text).toBe(answerText(getAnswerEntry('add'), 'fox'));
  });

  it('answerQuestion: незнакомый вопрос и HTML → { id: unknown, ответ персонажа }; вопрос в ответ не вставляется', () => {
    const html = '<img src=x onerror=alert(1)>';
    const result = answerQuestion(html, 'owl');
    expect(result).toEqual({ id: 'unknown', text: unknownAnswer('owl') });
    expect(result.text).not.toContain('<img');
  });

  it('неизвестный персонаж → стиль кота', () => {
    expect(unknownAnswer('beaver')).toBe(unknownAnswer('cat'));
    const entry = getAnswerEntry('streak');
    expect(answerText(entry, 'beaver')).toBe(answerText(entry, 'cat'));
  });
});
