const Apify = require('apify');
const moment = require('moment');
const _ = require('lodash');
const { log } = Apify.utils;

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.santepubliquefrance.fr/maladies-et-traumatismes/maladies-et-infections-respiratoires/infection-a-coronavirus/articles/infection-au-nouveau-coronavirus-sars-cov-2-covid-19-france-et-monde';
    const kvStore = await Apify.openKeyValueStore("COVID-19-FRANCE");
    const dataset = await Apify.openDataset("COVID-19-FRANCE-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        handlePageFunction: async ({ request, html, $ }) => {
            log.info(`Processing ${request.url}...`);
            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/drobnikj/covid-france",
            };

            const coronaBlock = $('#block-236243');
            const text = coronaBlock.text();

            // Match infected
            const matchInfected = text.match(/(\s\d+\s?\d+\s)cas COVID-19/);
            if (matchInfected && matchInfected[1]) {
                data.infected = parseInt(matchInfected[1].replace(/\s/g, ''));
            } else {
                throw new Error('Infected not found');
            }

            // Match deceased
            const matchDeceased = text.match(/incluant(\s\d+\s?\d+\s)décès/);
            if (matchDeceased && matchDeceased[1]) {
                data.deceased = parseInt(matchDeceased[1].replace(/\s/g, ''));
            } else {
                throw new Error('Deceased not found');
            }

            // Match updatedAt
            const h2Text = coronaBlock.find('h2.item__title').eq(0).text();
            const matchUpadatedAt = h2Text.match(/(\d+)\/(\d+)\/(\d+) à (\d+)h/);
            if (matchUpadatedAt && matchUpadatedAt.length > 4) {
                data.lastUpdatedAtSource = moment({
                    year: parseInt(matchUpadatedAt[3]),
                    month: parseInt(matchUpadatedAt[2]),
                    date: parseInt(matchUpadatedAt[1]),
                    hour: parseInt(matchUpadatedAt[4]),
                    minute: 0,
                    second: 0,
                    millisecond: 0
                }).toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
         },

        handleFailedRequestFunction: async ({ request }) => {
            throw new Error('Scrape didn\'t finish! Needs to be check!');
        },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    log.info('Crawler finished.');
});
