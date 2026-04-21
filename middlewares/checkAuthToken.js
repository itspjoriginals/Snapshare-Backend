const jwt = require('jsonwebtoken');

function checkAuth(req, res, next) {
    try {
        const { authToken, refreshToken } = req.cookies;

        if (!authToken || !refreshToken) {
            return res.status(401).json({
                message: 'Authentication failed: Tokens missing',
                ok: false
            });
        }

        try {
            const decoded = jwt.verify(authToken, process.env.JWT_SECRET_KEY);
            req.userId = decoded.userId;
            req.ok = true;
            return next();
        } catch (err) {

            if (err.name !== "TokenExpiredError") {
                return res.status(401).json({
                    message: 'Invalid auth token',
                    ok: false
                });
            }

            const refreshDecoded = jwt.verify(
                refreshToken,
                process.env.JWT_REFRESH_SECRET_KEY // ✅ FIXED
            );

            const newAuthToken = jwt.sign(
                { userId: refreshDecoded.userId },
                process.env.JWT_SECRET_KEY,
                { expiresIn: '10m' }
            );

            const isProd = process.env.NODE_ENV === "production";

            res.cookie('authToken', newAuthToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: isProd ? 'none' : 'lax'
            });

            req.userId = refreshDecoded.userId;
            req.ok = true;
            return next();
        }

    } catch (error) {
        return res.status(401).json({
            message: 'Authentication failed',
            ok: false
        });
    }
}

module.exports = checkAuth;