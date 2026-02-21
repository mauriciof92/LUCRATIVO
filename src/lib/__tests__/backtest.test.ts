// Mock do engine para evitar problemas de importação
jest.mock('../../engine', () => ({
  parseCSV: jest.fn((csvText: string) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');
    const games = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length >= headers.length) {
        const game: any = {};
        headers.forEach((header, index) => {
          const value = values[index];
          // Converter valores numéricos
          if (header === 'ResultHome' || header === 'ResultAway' || header === 'ExG' || header === 'ExGraw' || 
              header === 'ExC' || header === 'CV' || header === 'AFH' || header === 'AFU' || header === 'AFDiff' ||
              header === 'AFH%' || header === 'AFU%' || header === 'ChFavGol' || header === 'ChFavHT' || header === 'ChFavTot' ||
              header === 'Gol05HTFav' || header === 'CantFavHT' || header === 'CantFavFT' || header === 'CantFavTot' ||
              header === 'Gol05HTUnder' || header === 'CantUnderHT' || header === 'CantUnderFT' || header === 'CantUnderTot' ||
              header === 'ChUnderGol' || header === 'ChUnderTot' || header === 'CantUnderHT' || header === 'CantUnderFT' || header === 'CantUnderTot') {
            game[header] = parseFloat(value) || 0;
          } else {
            game[header] = value;
          }
        });
        games.push(game);
      }
    }
    
    return { games, dbg: null };
  }),
  getOddForLabel: jest.fn(() => 2.0),
  getMinOddForLabel: jest.fn(() => 1.8),
  classifyProfile: jest.fn(() => 'balanced_btts'),
  suggestMainMarket: jest.fn(() => 'Over 1.5 FT'),
  suggestCombo: jest.fn(() => ['BTTS', 'Fav Vence']),
  getFavorito: jest.fn(() => ({ lado: 'home', nome: 'Team A' })),
  computeConfidence: jest.fn(() => 0.75),
  computeScore: jest.fn(() => 0.65),
  getScore: jest.fn(() => 0.65),
  calculateRiskAdjustedStake: jest.fn(() => 1),
  shouldSkipBet: jest.fn(() => false),
  calculateValueBet: jest.fn(() => false),
}));

import { validateWithManualInput } from '../backtest';
import type { BetResult } from '../backtest';

describe('validateWithManualInput', () => {
  describe('Finalizações HT - Over 5.5', () => {
    test('shots: 6 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 5.5 Finalizações HT', { shots: 6 });
      expect(result).toBe('win');
    });

    test('shots: 5 deve retornar "lose"', () => {
      const result = validateWithManualInput('Over 5.5 Finalizações HT', { shots: 5 });
      expect(result).toBe('lose');
    });

    test('shots: 7 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 5.5 Finalizações HT', { shots: 7 });
      expect(result).toBe('win');
    });
  });

  describe('Finalizações HT - Over 3.5', () => {
    test('shots: 4 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 3.5 Finalizações HT', { shots: 4 });
      expect(result).toBe('win');
    });

    test('shots: 3 deve retornar "lose"', () => {
      const result = validateWithManualInput('Over 3.5 Finalizações HT', { shots: 3 });
      expect(result).toBe('lose');
    });

    test('shots: 5 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 3.5 Finalizações HT', { shots: 5 });
      expect(result).toBe('win');
    });
  });

  describe('Cantos HT - Over 2.5', () => {
    test('corners: 3 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 2.5 Cantos HT', { corners: 3 });
      expect(result).toBe('win');
    });

    test('corners: 2 deve retornar "lose"', () => {
      const result = validateWithManualInput('Over 2.5 Cantos HT', { corners: 2 });
      expect(result).toBe('lose');
    });

    test('corners: 4 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 2.5 Cantos HT', { corners: 4 });
      expect(result).toBe('win');
    });
  });

  describe('Cantos HT - Over 3.5', () => {
    test('corners: 4 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 3.5 Cantos HT', { corners: 4 });
      expect(result).toBe('win');
    });

    test('corners: 3 deve retornar "lose"', () => {
      const result = validateWithManualInput('Over 3.5 Cantos HT', { corners: 3 });
      expect(result).toBe('lose');
    });

    test('corners: 5 deve retornar "win"', () => {
      const result = validateWithManualInput('Over 3.5 Cantos HT', { corners: 5 });
      expect(result).toBe('win');
    });
  });

  describe('Input inválido', () => {
    test('deve retornar "no-odd" para input ausente', () => {
      const result = validateWithManualInput('Over 5.5 Finalizações HT', {});
      expect(result).toBe('no-odd');
    });

    test('deve retornar "lose" para input zero', () => {
      const result = validateWithManualInput('Over 5.5 Finalizações HT', { shots: 0 });
      expect(result).toBe('lose');
    });

    test('deve retornar "no-odd" para mercado desconhecido', () => {
      const result = validateWithManualInput('Mercado Desconhecido', { shots: 6 });
      expect(result).toBe('no-odd');
    });
  });
});
