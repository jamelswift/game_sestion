import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

import { level1Layout } from 'src/board/board-layout-level1';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    try {
        // Create board spaces
        const boardSpacesToCreate = level1Layout.map((spaceType, index) => ({
            position: index,
            type: spaceType,
        }));

        await prisma.boardSpace.createMany({
            data: boardSpacesToCreate,
            skipDuplicates: true,
        });

        // 2. Create careers
        const dataDir = path.join(__dirname, 'data-catalog');
        const occupationsPath = path.join(dataDir, 'occupations.json');
        const occupationsFile = fs.readFileSync(occupationsPath, 'utf-8');
        const occupationsData = JSON.parse(occupationsFile);

        for (const occupation of occupationsData) {
            await prisma.career.upsert({
                where: { name: occupation.occupation },
                update: {},
                create: {
                    name: occupation.occupation,
                    baseSalary: occupation.income,
                    startingCash: occupation.starting_cash,
                    startingSavings: 0,
                    description: occupation.description || `Career: ${occupation.occupation}`,
                    
                    startingExpenses: {
                        create: Object.entries(occupation.expenses_details).map(([name, amount]) => ({
                            name: name.replace(/_/g, ' '),
                            amount: amount as number, 
                        })),
                    },
                
                    ...(occupation.remaining_debt > 0 && {
                        startingDebts: {
                            create: {
                                name: 'Initial Debt',
                                principalAmount: occupation.remaining_debt,
                            },
                        },
                    }),
                },
            });
        }

        // Create Cards
        const cardFiles = [
            'cards-opportunity-level1.1.json',
            'cards-invest_in_yourself-level1.1.json',
            'cards-market-level1.1.json',
            'cards-luxury-level-1.1.json',
            'cards-life_event-level1.1.json'
        ];

        for (const fileName of cardFiles) {
            const filePath = path.join(dataDir, fileName);
            
            // check if file exists
            if (!fs.existsSync(filePath)) {
                console.warn(` File not found: ${fileName}`);
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const cardsData = JSON.parse(fileContent);

            for (const oldCard of cardsData) {
                const {
                    Card_id,
                    Card_type,
                    Card_level,
                    Title,
                    Description,
                    ...restOfCard 
                } = oldCard;

                if (!Card_id) {
                    console.warn(`Skipping card without Card_id in ${fileName}: ${Title}`);
                    continue;
                }

                await prisma.card.upsert({
                    where: { id: Card_id },
                    update: {},
                    create: {
                        id: Card_id,
                        type: Card_type,
                        gameLevel: Card_level,
                        title: Title,
                        description: Description,
                        effectData: restOfCard as Record<string, any>,
                    },
                });
            }
            console.log(`Seeded ${fileName} successfully`);
        }

        console.log(' Seeding finished successfully!');

    } catch (error) {
        console.error('Error during seeding:', error);
        throw error;
    }
}


main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });