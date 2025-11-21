import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService, CatalogData } from './catalog.service';


@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}


  @Get('careers')
  async getCareers() {
    return this.catalogService.getCareers();
  }


  @Get('goals')
  async getGoals() {
    return this.catalogService.getGoals();
  }


  @Get('cards')
  async getCards(
    @Query('gameLevel') gameLevel?: string,
    @Query('cardType') cardType?: string,
  ) {
    if (cardType) {
      return this.catalogService.getCardsByType(cardType, gameLevel);
    }
    return this.catalogService.getCards(gameLevel);
  }


  @Get('assets')
  async getAssets(@Query('assetType') assetType?: string) {
    if (assetType) {
      return this.catalogService.getAssetsByType(assetType);
    }
    return this.catalogService.getAssets();
  }


  @Get('debts')
  async getDebts() {
    return this.catalogService.getDebts();
  }


  @Get('board-layout')
  async getBoardSpaces() {
    return this.catalogService.getBoardSpaces();
  }


  @Get('all')
  async getAllCatalogData(@Query('gameLevel') gameLevel?: string) {
    try {
      return await this.catalogService.getAllCatalogData(gameLevel);
    } catch (error) {
      return { careers: [], cards: [], occupations: [], boardSpaces: [] };
    }
  }
}