const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const ACT = 'California Revenue and Taxation Code, Personal Income Tax Law (Part 10, Division 2)';
const BOOKLET_2025 = 'Franchise Tax Board, 2025 Personal Income Tax Booklet (Form 540 instructions, Schedule CA (540) instructions, Tax Table and Tax Rate Schedules), ftb.ca.gov/forms/2025/2025-540-booklet.pdf, and Form 540 (ftb.ca.gov/forms/2025/2025-540.pdf), read 2026-11-21';
const NR_2025 = 'Franchise Tax Board, 2025 540NR Tax Booklet (Form 540NR and Schedule CA (540NR) instructions), ftb.ca.gov/forms/2025/2025-540nr-booklet.pdf, read 2026-11-21';
const SCHEDULES_2025 = 'Franchise Tax Board, 2025 California Tax Rate Schedules, ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf, read 2026-11-21';
const INDEXING_2026 = 'Franchise Tax Board, Tax News October 2026, "2026 Indexing" (ftb.ca.gov/about-ftb/newsroom/tax-news/2026/10.html), and 2026 California Tax Rate Schedules (ftb.ca.gov/forms/2026/2026-540-tax-rate-schedules.pdf), read 2026-11-21';
const EITC_2025 = 'Franchise Tax Board, 2025 FTB 3514 California Earned Income Tax Credit Booklet (ftb.ca.gov/forms/2025/2025-3514-booklet.pdf) and form FTB 3514 (ftb.ca.gov/forms/2025/2025-3514.pdf), read 2026-11-21';
const NOT_YET_2026 = 'Tax News October 2026 (ftb.ca.gov/about-ftb/newsroom/tax-news/2026/10.html, read 2026-11-21) says the complete 2026 tax rates and exemption amounts will be published in late December 2026; this figure is not among the 2026 amounts announced there, so the 2025 figure is carried and the record is marked provisional';
const PROVISIONAL = { provisional: true };

const SCHEDULES = {
  2025: {
    single: [[0, 100, 0], [11079, 200, 11079], [26264, 400, 41449], [41452, 600, 102201], [57542, 800, 198741], [72724, 930, 320197], [371479, 1030, 3098619], [445771, 1130, 3863827], [742953, 1230, 7221984]],
    mfj: [[0, 100, 0], [22158, 200, 22158], [52528, 400, 82898], [82904, 600, 204402], [115084, 800, 397482], [145448, 930, 640394], [742958, 1030, 6197237], [891542, 1130, 7727652], [1485906, 1230, 14443965]],
    hoh: [[0, 100, 0], [22173, 200, 22173], [52530, 400, 82887], [67716, 600, 143631], [83805, 800, 240165], [98990, 930, 361645], [505208, 1030, 4139472], [606251, 1130, 5180215], [1010417, 1230, 9747291]],
  },
  2026: {
    single: [[0, 100, 0], [11456, 200, 11456], [27157, 400, 42858], [42861, 600, 105674], [59498, 800, 205496], [75197, 930, 331088], [384109, 1030, 3203970], [460927, 1130, 3995195], [768213, 1230, 7467527]],
    mfj: [[0, 100, 0], [22912, 200, 22912], [54314, 400, 85716], [85722, 600, 211348], [118996, 800, 410992], [150394, 930, 662176], [768218, 1030, 6407939], [921854, 1130, 7990390], [1536426, 1230, 14935054]],
    hoh: [[0, 100, 0], [22927, 200, 22927], [54316, 400, 85705], [70018, 600, 148513], [86654, 800, 248329], [102356, 930, 373945], [522385, 1030, 4280215], [626864, 1130, 5356349], [1044771, 1230, 10078698]],
  },
};
const bands = (rows) => rows.map(([over, rateBp, baseCents]) => ({ overCents: over * 100, rateBp, baseCents }));
const schedulesOf = (y) => ({ single: bands(SCHEDULES[y].single), mfs: bands(SCHEDULES[y].single), mfj: bands(SCHEDULES[y].mfj), qss: bands(SCHEDULES[y].mfj), hoh: bands(SCHEDULES[y].hoh) });

const EITC_TABLE_2025 = {
  rowWidth: 50,
  maxIncome: 32900,
  credits: {
    0: [2, 5, 8, 11, 15, 18, 21, 24, 28, 31, 34, 37, 41, 44, 47, 50, 54, 57, 60, 63, 67, 70, 73, 76, 80, 83, 86, 89, 93, 96, 99, 102, 106, 109, 112, 115, 119, 122, 125, 128, 132, 135, 138, 141, 145, 148, 151, 154, 158, 161, 164, 167, 171, 174, 177, 180, 184, 187, 190, 193, 197, 200, 203, 206, 210, 213, 216, 219, 223, 226, 229, 232, 236, 239, 242, 246, 249, 252, 255, 259, 262, 265, 268, 272, 275, 278, 281, 285, 288, 291, 294, 298, 301, 302, 299, 296, 292, 289, 286, 283, 279, 276, 273, 270, 266, 263, 260, 257, 253, 252, 252, 251, 251, 250, 250, 250, 249, 249, 248, 248, 247, 247, 246, 246, 245, 245, 244, 244, 244, 243, 243, 242, 242, 241, 241, 240, 240, 239, 239, 239, 238, 238, 237, 237, 236, 236, 235, 235, 234, 234, 233, 233, 233, 232, 232, 231, 231, 230, 230, 229, 229, 228, 228, 228, 227, 227, 226, 226, 225, 225, 224, 224, 223, 223, 222, 222, 222, 221, 221, 220, 220, 219, 219, 218, 218, 217, 217, 216, 216, 216, 215, 215, 214, 214, 213, 213, 212, 212, 211, 211, 211, 210, 210, 209, 209, 208, 208, 207, 207, 206, 206, 205, 205, 205, 204, 204, 203, 203, 202, 202, 201, 201, 200, 200, 200, 199, 199, 198, 198, 197, 197, 196, 196, 195, 195, 194, 194, 194, 193, 193, 192, 192, 191, 191, 190, 190, 189, 189, 188, 188, 188, 187, 187, 186, 186, 185, 185, 184, 184, 183, 183, 183, 182, 182, 181, 181, 180, 180, 179, 179, 178, 178, 177, 177, 177, 176, 176, 175, 175, 174, 174, 173, 173, 172, 172, 172, 171, 171, 170, 170, 169, 169, 168, 168, 167, 167, 166, 166, 166, 165, 165, 164, 164, 163, 163, 162, 162, 161, 161, 160, 160, 160, 159, 159, 158, 158, 157, 157, 156, 156, 155, 155, 155, 154, 154, 153, 153, 152, 152, 151, 151, 150, 150, 149, 149, 149, 148, 148, 147, 147, 146, 146, 145, 145, 144, 144, 144, 143, 143, 142, 142, 141, 141, 140, 140, 139, 139, 138, 138, 138, 137, 137, 136, 136, 135, 135, 134, 134, 133, 133, 132, 132, 132, 131, 131, 130, 130, 129, 129, 128, 128, 127, 127, 127, 126, 126, 125, 125, 124, 124, 123, 123, 122, 122, 121, 121, 121, 120, 120, 119, 119, 118, 118, 117, 117, 116, 116, 116, 115, 115, 114, 114, 113, 113, 112, 112, 111, 111, 110, 110, 110, 109, 109, 108, 108, 107, 107, 106, 106, 105, 105, 104, 104, 104, 103, 103, 102, 102, 101, 101, 100, 100, 99, 99, 99, 98, 98, 97, 97, 96, 96, 95, 95, 94, 94, 93, 93, 93, 92, 92, 91, 91, 90, 90, 89, 89, 88, 88, 88, 87, 87, 86, 86, 85, 85, 84, 84, 83, 83, 82, 82, 82, 81, 81, 80, 80, 79, 79, 78, 78, 77, 77, 76, 76, 76, 75, 75, 74, 74, 73, 73, 72, 72, 71, 71, 71, 70, 70, 69, 69, 68, 68, 67, 67, 66, 66, 65, 65, 65, 64, 64, 63, 63, 62, 62, 61, 61, 60, 60, 60, 59, 59, 58, 58, 57, 57, 56, 56, 55, 55, 54, 54, 54, 53, 53, 52, 52, 51, 51, 50, 50, 49, 49, 48, 48, 48, 47, 47, 46, 46, 45, 45, 44, 44, 43, 43, 43, 42, 42, 41, 41, 40, 40, 39, 39, 38, 38, 37, 37, 37, 36, 36, 35, 35, 34, 34, 33, 33, 32, 32, 32, 31, 31, 30, 30, 29, 29, 28, 28, 27, 27, 26, 26, 26, 25, 25, 24, 24, 23, 23, 22, 22, 21, 21, 20, 20, 20, 19, 19, 18, 18, 17, 17, 16, 16, 15, 15, 15, 14, 14, 13, 13, 12, 12, 11, 11, 10, 10, 9, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 4, 3, 3, 2, 2, 1, 1],
    1: [7, 22, 36, 51, 65, 80, 94, 109, 123, 137, 152, 166, 181, 195, 210, 224, 239, 253, 267, 282, 296, 311, 325, 340, 354, 369, 383, 398, 412, 426, 441, 455, 470, 484, 499, 513, 528, 542, 556, 571, 585, 600, 614, 629, 643, 658, 672, 687, 701, 715, 730, 744, 759, 773, 788, 802, 817, 831, 845, 860, 874, 889, 903, 918, 932, 947, 961, 976, 990, 1004, 1019, 1033, 1048, 1062, 1077, 1091, 1106, 1120, 1134, 1149, 1163, 1178, 1192, 1207, 1221, 1236, 1250, 1265, 1279, 1293, 1308, 1322, 1337, 1351, 1366, 1380, 1395, 1409, 1423, 1438, 1452, 1467, 1481, 1496, 1510, 1525, 1539, 1554, 1568, 1582, 1597, 1611, 1626, 1640, 1655, 1669, 1684, 1698, 1712, 1727, 1741, 1756, 1770, 1785, 1799, 1814, 1828, 1843, 1857, 1871, 1886, 1900, 1915, 1929, 1944, 1958, 1973, 1987, 2001, 2016, 2014, 2000, 1986, 1971, 1957, 1942, 1928, 1913, 1899, 1884, 1870, 1856, 1841, 1827, 1812, 1798, 1783, 1769, 1754, 1740, 1725, 1711, 1697, 1682, 1668, 1653, 1639, 1624, 1610, 1595, 1581, 1567, 1552, 1538, 1523, 1509, 1494, 1480, 1465, 1451, 1436, 1422, 1408, 1393, 1379, 1364, 1350, 1335, 1321, 1306, 1292, 1278, 1263, 1249, 1234, 1220, 1205, 1191, 1176, 1162, 1147, 1133, 1119, 1104, 1090, 1075, 1061, 1046, 1032, 1017, 1003, 989, 974, 960, 945, 931, 916, 902, 887, 873, 858, 844, 830, 815, 801, 786, 772, 757, 743, 728, 714, 700, 685, 671, 656, 642, 634, 632, 631, 629, 628, 626, 625, 623, 622, 620, 619, 617, 616, 614, 613, 611, 610, 608, 607, 605, 604, 602, 601, 599, 598, 596, 595, 593, 592, 590, 589, 587, 586, 584, 583, 581, 580, 578, 577, 575, 574, 572, 571, 569, 568, 566, 565, 563, 562, 560, 559, 557, 556, 554, 553, 551, 550, 548, 547, 545, 544, 542, 541, 539, 538, 536, 535, 533, 532, 530, 529, 527, 526, 524, 523, 521, 520, 518, 517, 515, 514, 512, 511, 509, 508, 506, 505, 503, 502, 500, 499, 497, 496, 494, 493, 491, 490, 488, 487, 485, 484, 482, 481, 479, 477, 476, 474, 473, 471, 470, 468, 467, 465, 464, 462, 461, 459, 458, 456, 455, 453, 452, 450, 449, 447, 446, 444, 443, 441, 440, 438, 437, 435, 434, 432, 431, 429, 428, 426, 425, 423, 422, 420, 419, 417, 416, 414, 413, 411, 410, 408, 407, 405, 404, 402, 401, 399, 398, 396, 395, 393, 392, 390, 389, 387, 386, 384, 383, 381, 380, 378, 377, 375, 374, 372, 371, 369, 368, 366, 365, 363, 362, 360, 359, 357, 356, 354, 353, 351, 350, 348, 347, 345, 344, 342, 341, 339, 338, 336, 335, 333, 332, 330, 329, 327, 326, 324, 323, 321, 320, 318, 317, 315, 314, 312, 310, 309, 307, 306, 304, 303, 301, 300, 298, 297, 295, 294, 292, 291, 289, 288, 286, 285, 283, 282, 280, 279, 277, 276, 274, 273, 271, 270, 268, 267, 265, 264, 262, 261, 259, 258, 256, 255, 253, 252, 250, 249, 247, 246, 244, 243, 241, 240, 238, 237, 235, 234, 232, 231, 229, 228, 226, 225, 223, 222, 220, 219, 217, 216, 214, 213, 211, 210, 208, 207, 205, 204, 202, 201, 199, 198, 196, 195, 193, 192, 190, 189, 187, 186, 184, 183, 181, 180, 178, 177, 175, 174, 172, 171, 169, 168, 166, 165, 163, 162, 160, 159, 157, 156, 154, 153, 151, 150, 148, 147, 145, 143, 142, 140, 139, 137, 136, 134, 133, 131, 130, 128, 127, 125, 124, 122, 121, 119, 118, 116, 115, 113, 112, 110, 109, 107, 106, 104, 103, 101, 100, 98, 97, 95, 94, 92, 91, 89, 88, 86, 85, 83, 82, 80, 79, 77, 76, 74, 73, 71, 70, 68, 67, 65, 64, 62, 61, 59, 58, 56, 55, 53, 52, 50, 49, 47, 46, 44, 43, 41, 40, 38, 37, 35, 34, 32, 31, 29, 28, 26, 25, 23, 22, 20, 19, 17, 16, 14, 13, 11, 10, 8, 7, 5, 4, 2, 1],
    2: [9, 26, 43, 60, 77, 94, 111, 128, 145, 162, 179, 196, 213, 230, 247, 264, 281, 298, 315, 332, 349, 366, 383, 400, 417, 434, 451, 468, 485, 502, 519, 536, 553, 570, 587, 604, 621, 638, 655, 672, 689, 706, 723, 740, 757, 774, 791, 808, 825, 842, 859, 876, 893, 910, 927, 944, 961, 978, 995, 1012, 1029, 1046, 1063, 1080, 1097, 1114, 1131, 1148, 1165, 1182, 1199, 1216, 1233, 1250, 1267, 1284, 1301, 1318, 1335, 1352, 1369, 1386, 1403, 1420, 1437, 1454, 1471, 1488, 1505, 1522, 1539, 1556, 1573, 1590, 1607, 1624, 1641, 1658, 1675, 1692, 1709, 1726, 1743, 1760, 1777, 1794, 1811, 1828, 1845, 1862, 1879, 1896, 1913, 1930, 1947, 1964, 1981, 1998, 2015, 2032, 2049, 2066, 2083, 2100, 2117, 2134, 2151, 2168, 2185, 2202, 2219, 2236, 2253, 2270, 2287, 2304, 2321, 2338, 2355, 2372, 2389, 2406, 2423, 2440, 2457, 2474, 2491, 2508, 2525, 2542, 2559, 2576, 2593, 2610, 2627, 2644, 2661, 2678, 2695, 2712, 2729, 2746, 2763, 2780, 2797, 2814, 2831, 2848, 2865, 2882, 2899, 2916, 2933, 2950, 2967, 2984, 3001, 3018, 3035, 3052, 3069, 3086, 3103, 3120, 3137, 3154, 3171, 3188, 3205, 3222, 3239, 3256, 3273, 3290, 3307, 3324, 3339, 3322, 3305, 3288, 3271, 3254, 3237, 3220, 3203, 3186, 3169, 3152, 3135, 3118, 3101, 3084, 3067, 3050, 3033, 3016, 2999, 2982, 2965, 2948, 2931, 2914, 2897, 2880, 2863, 2846, 2829, 2812, 2795, 2778, 2761, 2744, 2727, 2710, 2693, 2676, 2659, 2642, 2625, 2608, 2591, 2574, 2557, 2540, 2523, 2506, 2489, 2472, 2455, 2438, 2421, 2404, 2387, 2370, 2353, 2336, 2319, 2302, 2285, 2268, 2251, 2234, 2217, 2200, 2183, 2166, 2149, 2132, 2115, 2098, 2081, 2064, 2047, 2030, 2013, 1996, 1979, 1962, 1945, 1928, 1911, 1894, 1877, 1860, 1843, 1826, 1809, 1792, 1775, 1758, 1741, 1724, 1707, 1690, 1673, 1656, 1639, 1622, 1605, 1588, 1571, 1554, 1537, 1520, 1503, 1486, 1469, 1452, 1435, 1418, 1401, 1384, 1367, 1350, 1333, 1316, 1299, 1282, 1265, 1248, 1231, 1214, 1197, 1180, 1163, 1146, 1129, 1112, 1095, 1078, 1061, 1044, 1027, 1010, 993, 976, 959, 942, 925, 908, 891, 874, 857, 840, 823, 806, 789, 772, 755, 738, 721, 704, 687, 670, 653, 636, 633, 631, 629, 626, 624, 622, 620, 618, 616, 614, 612, 610, 608, 605, 603, 601, 599, 597, 595, 593, 591, 589, 587, 584, 582, 580, 578, 576, 574, 572, 570, 568, 566, 563, 561, 559, 557, 555, 553, 551, 549, 547, 545, 542, 540, 538, 536, 534, 532, 530, 528, 526, 524, 521, 519, 517, 515, 513, 511, 509, 507, 505, 503, 500, 498, 496, 494, 492, 490, 488, 486, 484, 482, 479, 477, 475, 473, 471, 469, 467, 465, 463, 461, 458, 456, 454, 452, 450, 448, 446, 444, 442, 440, 438, 435, 433, 431, 429, 427, 425, 423, 421, 419, 417, 414, 412, 410, 408, 406, 404, 402, 400, 398, 396, 393, 391, 389, 387, 385, 383, 381, 379, 377, 375, 372, 370, 368, 366, 364, 362, 360, 358, 356, 354, 351, 349, 347, 345, 343, 341, 339, 337, 335, 333, 330, 328, 326, 324, 322, 320, 318, 316, 314, 312, 309, 307, 305, 303, 301, 299, 297, 295, 293, 291, 288, 286, 284, 282, 280, 278, 276, 274, 272, 270, 267, 265, 263, 261, 259, 257, 255, 253, 251, 249, 246, 244, 242, 240, 238, 236, 234, 232, 230, 228, 225, 223, 221, 219, 217, 215, 213, 211, 209, 207, 204, 202, 200, 198, 196, 194, 192, 190, 188, 186, 183, 181, 179, 177, 175, 173, 171, 169, 167, 165, 162, 160, 158, 156, 154, 152, 150, 148, 146, 144, 141, 139, 137, 135, 133, 131, 129, 127, 125, 123, 120, 118, 116, 114, 112, 110, 108, 106, 104, 102, 99, 97, 95, 93, 91, 89, 87, 85, 83, 81, 78, 76, 74, 72, 70, 68, 66, 64, 62, 60, 57, 55, 53, 51, 49, 47, 45, 43, 41, 39, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 13, 11, 9, 7, 5, 3, 1],
    3: [10, 29, 48, 67, 86, 105, 125, 144, 163, 182, 201, 220, 239, 258, 278, 297, 316, 335, 354, 373, 392, 411, 431, 450, 469, 488, 507, 526, 545, 564, 584, 603, 622, 641, 660, 679, 698, 717, 737, 756, 775, 794, 813, 832, 851, 870, 890, 909, 928, 947, 966, 985, 1004, 1023, 1043, 1062, 1081, 1100, 1119, 1138, 1157, 1176, 1196, 1215, 1234, 1253, 1272, 1291, 1310, 1329, 1349, 1368, 1387, 1406, 1425, 1444, 1463, 1482, 1502, 1521, 1540, 1559, 1578, 1597, 1616, 1635, 1655, 1674, 1693, 1712, 1731, 1750, 1769, 1788, 1808, 1827, 1846, 1865, 1884, 1903, 1922, 1941, 1961, 1980, 1999, 2018, 2037, 2056, 2075, 2094, 2114, 2133, 2152, 2171, 2190, 2209, 2228, 2247, 2267, 2286, 2305, 2324, 2343, 2362, 2381, 2400, 2420, 2439, 2458, 2477, 2496, 2515, 2534, 2553, 2573, 2592, 2611, 2630, 2649, 2668, 2687, 2706, 2726, 2745, 2764, 2783, 2802, 2821, 2840, 2859, 2879, 2898, 2917, 2936, 2955, 2974, 2993, 3012, 3032, 3051, 3070, 3089, 3108, 3127, 3146, 3165, 3185, 3204, 3223, 3242, 3261, 3280, 3299, 3318, 3338, 3357, 3376, 3395, 3414, 3433, 3452, 3471, 3491, 3510, 3529, 3548, 3567, 3586, 3605, 3624, 3644, 3663, 3682, 3701, 3720, 3739, 3756, 3737, 3718, 3699, 3680, 3661, 3642, 3622, 3603, 3584, 3565, 3546, 3527, 3508, 3489, 3469, 3450, 3431, 3412, 3393, 3374, 3355, 3336, 3316, 3297, 3278, 3259, 3240, 3221, 3202, 3183, 3163, 3144, 3125, 3106, 3087, 3068, 3049, 3030, 3010, 2991, 2972, 2953, 2934, 2915, 2896, 2877, 2857, 2838, 2819, 2800, 2781, 2762, 2743, 2724, 2704, 2685, 2666, 2647, 2628, 2609, 2590, 2571, 2551, 2532, 2513, 2494, 2475, 2456, 2437, 2418, 2398, 2379, 2360, 2341, 2322, 2303, 2284, 2265, 2245, 2226, 2207, 2188, 2169, 2150, 2131, 2112, 2092, 2073, 2054, 2035, 2016, 1997, 1978, 1959, 1939, 1920, 1901, 1882, 1863, 1844, 1825, 1806, 1786, 1767, 1748, 1729, 1710, 1691, 1672, 1653, 1633, 1614, 1595, 1576, 1557, 1538, 1519, 1500, 1480, 1461, 1442, 1423, 1404, 1385, 1366, 1347, 1327, 1308, 1289, 1270, 1251, 1232, 1213, 1194, 1174, 1155, 1136, 1117, 1098, 1079, 1060, 1041, 1021, 1002, 983, 964, 945, 926, 907, 888, 868, 849, 830, 811, 792, 773, 754, 735, 715, 696, 677, 658, 639, 633, 631, 629, 626, 624, 622, 620, 618, 616, 614, 612, 609, 607, 605, 603, 601, 599, 597, 595, 592, 590, 588, 586, 584, 582, 580, 577, 575, 573, 571, 569, 567, 565, 563, 560, 558, 556, 554, 552, 550, 548, 546, 543, 541, 539, 537, 535, 533, 531, 529, 526, 524, 522, 520, 518, 516, 514, 511, 509, 507, 505, 503, 501, 499, 497, 494, 492, 490, 488, 486, 484, 482, 480, 477, 475, 473, 471, 469, 467, 465, 463, 460, 458, 456, 454, 452, 450, 448, 445, 443, 441, 439, 437, 435, 433, 431, 428, 426, 424, 422, 420, 418, 416, 414, 411, 409, 407, 405, 403, 401, 399, 397, 394, 392, 390, 388, 386, 384, 382, 379, 377, 375, 373, 371, 369, 367, 365, 362, 360, 358, 356, 354, 352, 350, 348, 345, 343, 341, 339, 337, 335, 333, 330, 328, 326, 324, 322, 320, 318, 316, 313, 311, 309, 307, 305, 303, 301, 299, 296, 294, 292, 290, 288, 286, 284, 282, 279, 277, 275, 273, 271, 269, 267, 264, 262, 260, 258, 256, 254, 252, 250, 247, 245, 243, 241, 239, 237, 235, 233, 230, 228, 226, 224, 222, 220, 218, 216, 213, 211, 209, 207, 205, 203, 201, 198, 196, 194, 192, 190, 188, 186, 184, 181, 179, 177, 175, 173, 171, 169, 167, 164, 162, 160, 158, 156, 154, 152, 150, 147, 145, 143, 141, 139, 137, 135, 132, 130, 128, 126, 124, 122, 120, 118, 115, 113, 111, 109, 107, 105, 103, 101, 98, 96, 94, 92, 90, 88, 86, 84, 81, 79, 77, 75, 73, 71, 69, 66, 64, 62, 60, 58, 56, 54, 52, 49, 47, 45, 43, 41, 39, 37, 35, 32, 30, 28, 26, 24, 22, 20, 17, 15, 13, 11, 9, 7, 5, 3, 1],
  },
};

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.tax-rates',
    value: { schedules: schedulesOf(y) },
    basis: 'tax_rate_schedules_x_y_z_base_tax_in_cents_plus_the_rate_on_the_amount_over_the_bracket_floor_rounded_to_cents_then_to_whole_dollars',
    ...year(y),
    act: ACT,
    section: '17041; 17045; 17048',
    source: y === 2025 ? `${SCHEDULES_2025}: Schedule X single or married/RDP filing separately, Schedule Y married/RDP filing jointly or qualifying surviving spouse/RDP, Schedule Z head of household, with the base tax for each bracket and Step 4 "round the amount from Step 3 to two decimals ... After rounding the result" to whole dollars` : `${INDEXING_2026}: Schedules X, Y and Z for 2026 with the base tax for each bracket (CCPI inflation of 3.4% from June 2025 to June 2026)`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.tax-table',
    value: { maxTaxableIncome: 100000, firstRowTop: 50, rowWidth: 100, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'taxable_income_of_100000_or_less_uses_the_tax_table_rows_1_to_50_then_100_dollar_rows_from_51_to_100000_each_taxed_at_the_row_midpoint_by_the_rate_schedule',
    ...year(y),
    act: ACT,
    section: '17041(f)',
    source: y === 2025 ? `${BOOKLET_2025}: line 31 "If your taxable income on line 19 is $100,000 or less, use the tax table"; the 2025 Tax Table rows are $1-$50, then $51-$150 and every $100 to $99,951-$100,000; MyCA taxes each row at its midpoint with the rate schedule and this reproduces every row of the published 2025 table for filing statuses 1/3, 2/5 and 4` : `The 2026 Tax Table is not published as of 2026-11-21 (Tax News October 2026, ftb.ca.gov/about-ftb/newsroom/tax-news/2026/10.html, says late December 2026); the 2025 row layout and midpoint rule are applied to the published 2026 rate schedules and the record is provisional until the 2026 table is compared`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.standard-deduction',
    value: y === 2025 ? { single: 5706, mfs: 5706, mfj: 11412, qss: 11412, hoh: 11412 } : { single: 5900, mfs: 5900, mfj: 11800, qss: 11800, hoh: 11800 },
    basis: 'california_standard_deduction_by_filing_status',
    ...year(y),
    act: ACT,
    section: '17073.5',
    source: y === 2025 ? `${BOOKLET_2025}: California Standard Deduction Chart for Most People, $5,706 single or married/RDP filing separately, $11,412 married/RDP filing jointly, head of household or qualifying surviving spouse/RDP` : `${INDEXING_2026}: standard deduction $5,900 single or married filing separate, $11,800 joint, surviving spouse or head of household`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.dependent-standard-deduction',
    value: { minimum: 1350, earnedIncomeAddition: 450, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'someone_who_can_be_claimed_as_a_dependent_gets_the_larger_of_the_minimum_or_earned_income_plus_the_federal_addition_up_to_the_standard_deduction',
    ...year(y),
    act: ACT,
    section: '17073.5',
    source: y === 2025 ? `${BOOKLET_2025}: California Standard Deduction Worksheet for Dependents, line 1 earned income from line 2 of the federal Standard Deduction Worksheet for Dependents (earned income plus $450 in the 2025 federal Form 1040 instructions), line 2 minimum standard deduction $1,350` : NOT_YET_2026,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.exemption-credits',
    value: y === 2025 ? { personal: 153, blind: 153, senior: 153, dependent: 475 } : { personal: 158, blind: 158, senior: 158, dependent: 491 },
    basis: 'exemption_credits_per_personal_blind_and_senior_box_and_per_dependent',
    ...year(y),
    act: ACT,
    section: '17054',
    source: y === 2025 ? `${BOOKLET_2025}: Form 540 lines 7, 8 and 9 "X $153", line 10 "X $475"` : `${INDEXING_2026}: personal exemption credit $158 for single, separate and head of household, personal and senior exemption credit $316 for joint filers or surviving spouses ($158 each), dependent exemption credit $491; the blind credit is the same amount as the personal credit as on Form 540 line 8`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.agi-limitation',
    value: { threshold: { single: 252203, mfs: 252203, mfj: 504411, qss: 504411, hoh: 378310 }, exemptionStep: { other: 2500, mfs: 1250 }, exemptionReductionPerStep: 6, itemizedRateBasisPoints: 600, itemizedMaxBasisPoints: 8000, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'above_the_federal_agi_threshold_each_exemption_credit_is_reduced_6_dollars_per_2500_or_part_1250_if_separate_and_itemized_deductions_are_reduced_by_the_smaller_of_6_percent_of_the_excess_or_80_percent_of_the_deductions_other_than_medical_investment_interest_and_casualty',
    ...year(y),
    act: ACT,
    section: '17054.1; 17077',
    source: y === 2025 ? `${BOOKLET_2025}: line 32 AGI Limitation Worksheet ($252,203 single or married/RDP filing separately, $504,411 married/RDP filing jointly or qualifying surviving spouse/RDP, $378,310 head of household; divide by $2,500 ($1,250 if married/RDP filing separately) rounding up, multiply by $6) and Schedule CA (540) line 29 Itemized Deductions Worksheet (80% and 6%)` : NOT_YET_2026,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.itemized',
    value: { medicalFloorBasisPoints: 750, charityAgiLimitBasisPoints: 5000, nonCashAgiLimitBasisPoints: 3000, miscFloorBasisPoints: 200, mortgageAcquisitionLimit: { other: 1000000, mfs: 500000 }, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'california_itemized_deductions_no_state_income_tax_or_sdi_no_salt_cap_mortgage_debt_limit_1000000_charity_limited_to_50_percent_of_federal_agi_miscellaneous_deductions_over_2_percent',
    ...year(y),
    act: ACT,
    section: '17201; 17220; 17076',
    source: y === 2025 ? `${BOOKLET_2025}: Schedule CA (540) Part II line 4 (7.5%), line 5a (no deduction for state and local income tax, SDI or sales tax), line 5e (no federal $40,000 limit), line 8 ($1,000,000, $500,000 married filing separately acquisition debt), lines 11 and 12 ("California limits the amount of your deduction to 50% of your federal AGI"), lines 19 to 24 (2% of federal AGI)` : 'The 2026 Schedule CA (540) instructions are not published as of 2026-11-21; the 2025 rules are carried and the record is provisional',
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.renters-credit',
    value: { credit: { single: 60, mfs: 60, mfj: 120, qss: 120, hoh: 120 }, perMonth: { single: 5, mfs: 5, mfj: 10, qss: 10, hoh: 10 }, minimumMonths: 6, agiLimit: y === 2025 ? { single: 53994, mfs: 53994, mfj: 107988, qss: 107988, hoh: 107988 } : { single: 55830, mfs: 55830, mfj: 111660, qss: 111660, hoh: 111660 } },
    basis: 'nonrefundable_renters_credit_60_or_120_for_california_agi_at_or_below_the_limit_part_year_residents_5_or_10_per_full_month_from_6_months',
    ...year(y),
    act: ACT,
    section: '17053.5',
    source: y === 2025 ? `${BOOKLET_2025}: Nonrefundable Renter's Credit Qualification Record ($53,994 or less single or married/RDP filing separately, $107,988 or less otherwise; $60 single, $120 head of household, qualifying surviving spouse or joint); ${NR_2025}: Qualification Record chart $30 to $55 and $60 to $110 for 6 to 11 months` : `${INDEXING_2026}: Renter's Credit for single filers with AGI of $55,830 or less and joint filers $111,660 or less; the $60 and $120 credit amounts are fixed in R&TC 17053.5 and are not indexed`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.behavioral-health-tax',
    value: { thresholdCents: 100000000, rateBasisPoints: 100 },
    basis: 'one_percent_of_taxable_income_over_1000000',
    ...year(y),
    act: ACT,
    section: '17043',
    source: `${BOOKLET_2025}: line 62 Behavioral Health Services Tax worksheet, taxable income less $1,000,000 times 1%; ${NR_2025}: line 72 on CA taxable income (line 35). The threshold and rate are fixed by R&TC 17043 and are not indexed`,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.credit-limitation',
    value: { scheduleP: { single: 347808, hoh: 347808, mfj: 463745, qss: 463745, mfs: 231868 }, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'credits_other_than_exemption_credits_may_be_limited_by_tentative_minimum_tax_on_schedule_p_above_these_california_agi_amounts',
    ...year(y),
    act: ACT,
    section: '17039; 17062',
    source: y === 2025 ? `${BOOKLET_2025}: Special Credits Box C, Form 540 line 17 more than $347,808 single or head of household, $463,745 joint or qualifying surviving spouse, $231,868 married/RDP filing separately` : NOT_YET_2026,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.military-retirement',
    value: { capPerKind: 20000, agiLimit: { other: 125000, mfj: 250000, qss: 250000 }, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'uniformed_services_retirement_pay_and_survivor_benefit_plan_annuities_excluded_up_to_20000_each_when_federal_agi_is_within_the_limit',
    ...year(y),
    act: ACT,
    section: '17132.9; 17132.10',
    source: y === 2025 ? `${BOOKLET_2025}: Military Retirement Exclusion, and Schedule CA (540) instructions Part I line 5, "not to exceed $20,000 for each type of payments", federal AGI not more than $125,000 ($250,000 for a surviving spouse or spouses filing a joint return)` : 'The 2026 Schedule CA (540) instructions are not published as of 2026-11-21; R&TC 17132.9 and 17132.10 apply for taxable years 2025 through 2029 but the statute text was not re-read for this record, so the 2025 amounts are carried as provisional',
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.other-state-credit',
    value: { residentStates: ['AL', 'AR', 'CO', 'CT', 'DE', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'PA', 'RI', 'SC', 'UT', 'VT', 'WV', 'WI'], reverseCreditStates: ['AZ', 'OR', 'VA'], ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'residents_get_schedule_s_credit_for_net_income_tax_paid_to_listed_states_on_income_sourced_there_limited_to_the_california_tax_on_that_income_reverse_credit_states_give_the_credit_on_their_own_return',
    ...year(y),
    act: ACT,
    section: '18001; 18002; 18006',
    source: y === 2025 ? 'Franchise Tax Board, 2025 Instructions for Schedule S Other State Tax Credit (ftb.ca.gov/forms/2025/2025-540-s-instructions.html) General Information C California Residents and D California Nonresidents (Arizona, Guam, Oregon and Virginia), and Schedule S Part II lines 2 to 12 (ftb.ca.gov/forms/2025/2025-540-s.pdf), read 2026-11-21; DC, New Hampshire, Tennessee and Virginia (dual residents) are left out because they tax wages of California residents only in special cases' : 'The 2026 Schedule S instructions are not published as of 2026-11-21; the 2025 list is carried and the record is provisional',
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.eitc',
    value: { table: EITC_TABLE_2025, agiBelow: 32901, investmentIncomeLimit: 4814, agiLookupFrom: { 0: 4661, 1: 6998, 2: 9823, 3: 9823 }, minimumAgeWithoutChild: 18, minimumCaliforniaDays: 183, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'california_eitc_from_the_ftb_3514_table_by_california_earned_income_and_qualifying_children_the_smaller_of_the_earned_income_and_agi_lookups_above_the_agi_lookup_amounts',
    ...year(y),
    act: ACT,
    section: '17052',
    source: y === 2025 ? `${EITC_2025}: 2025 Earned Income Tax Credit Table ($1 to $32,900 in $50 rows, 0 to 3 qualifying children), California Earned Income Tax Credit Worksheet line 5 ($4,661, $6,998, $9,823), Step 1 federal AGI less than $32,901, Worksheet 1 investment income not more than $4,814, Step 4 age 18, Step 1g 183 days for Form 540NR filers` : NOT_YET_2026,
    attestations: [],
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ca.young-child-credits',
    value: { yctcAmount: 1189, fytcAmount: 1189, phaseOutStart: 27425, reductionCentsPer100: 2171, youngChildUnderAge: 6, zeroIncomeLimit: 35640, fosterYouthMinimumAge: 18, fosterYouthBelowAge: 26, ...(y === 2026 ? PROVISIONAL : {}) },
    basis: 'young_child_and_foster_youth_tax_credits_1189_reduced_by_21_71_for_each_100_of_california_earned_income_over_27425',
    ...year(y),
    act: ACT,
    section: '17052.1; 17052(c)(4)',
    source: y === 2025 ? `${EITC_2025}: Part VII lines 24 to 28 (Available YCTC $1,189, subtract $27,425, $21.71 per $100, between $0 and $1 enter $1), Step 8 ($35,640 limits when earned income is zero or less, child younger than six), Part IX lines 35 to 39 (FYTC $1,189 each, $43.42 when both spouses claim), Step 10 (age 18 to 25, foster care at 13 or older)` : NOT_YET_2026,
    attestations: [],
  })),
];
