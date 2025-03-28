// __tests__/mocks/clashApiService.mock.js

// Create a mock version of the ClashApiService for testing
const mockClanData = {
    tag: '#2PP',
    name: 'Test Clan',
    description: 'This is a test clan for unit tests',
    type: 'open',
    location: {
        id: 32000000,
        name: 'International',
        isCountry: false
    },
    badgeUrls: {
        small: 'https://example.com/small.png',
        medium: 'https://example.com/medium.png',
        large: 'https://example.com/large.png'
    },
    clanLevel: 10,
    clanPoints: 20000,
    clanVersusPoints: 15000,
    members: 30,
    memberList: [
        {
            tag: '#ABC123',
            name: 'Test Player 1',
            role: 'leader',
            expLevel: 150,
            league: {
                id: 29000000,
                name: 'Legend League'
            },
            trophies: 5000,
            versusTrophies: 4000,
            clanRank: 1,
            donations: 500,
            donationsReceived: 300
        }
    ]
};

// Mock API service methods
const clashApiServiceMock = {
    getClan: jest.fn().mockResolvedValue(mockClanData),
    getPlayer: jest.fn().mockResolvedValue({
        tag: '#ABC123',
        name: 'Test Player',
        townHallLevel: 12
    }),
    getCurrentWar: jest.fn().mockResolvedValue({
        state: 'notInWar'
    }),
    searchClans: jest.fn().mockResolvedValue({
        items: [mockClanData]
    }),
    getCapitalRaidSeasons: jest.fn().mockResolvedValue({
        items: []
    }),
    testProxyConnection: jest.fn().mockResolvedValue({ success: true }),
    formatTag: (tag) => tag.startsWith('#') ? tag : `#${tag}`,
    getStatus: jest.fn().mockReturnValue({
        apiKey: true,
        keyCount: 1,
        proxyConfigured: false,
        successRate: '100%'
    })
};

module.exports = clashApiServiceMock;